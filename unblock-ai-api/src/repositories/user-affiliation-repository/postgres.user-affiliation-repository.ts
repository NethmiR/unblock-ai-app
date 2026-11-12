import { query, withTransaction } from "../../db/postgres.client.js";
import { PostgresConstraint, PostgresErrorCode } from "../../data/constants/postgres.constant.js";
import { isPostgresError } from "../../utils/database/postgres-error.util.js";
import { compareDesignations } from "../../utils/organisation/designation-reference.util.js";
import { toOrganisationalUnitReference } from "../../utils/organisation/organisational-unit-reference.util.js";
import { compareMemberships, compareOrganisationalUnits } from "../../utils/user-affiliation/membership-order.util.js";
import { designationHolderConflict, facultyMembershipRequired } from "../../errors/user-affiliation.error.js";
import {
  ORGANISATIONAL_UNIT_COLUMNS,
  ORGANISATIONAL_UNIT_SOURCE,
  toOrganisationalUnitRecord,
  type OrganisationalUnitRow,
} from "../organisational-unit-repository/postgres.organisational-unit-row.js";
import {
  DESIGNATION_REFERENCE_COLUMNS,
  toDesignationReferenceFromRow,
  type DesignationReferenceRow,
} from "../designation-repository/postgres.designation-row.js";
import type { IUserAffiliationRepository } from "./user-affiliation-repository.interface.js";
import type { DesignationReference } from "../../lib/types/designation/designation.type.js";
import type {
  OrganisationalUnitMemberRecord,
  OrganisationalUnitRecord,
  OrganisationalUnitReference,
} from "../../lib/types/organisational-unit/organisational-unit.type.js";
import type {
  DesignationAssignmentKey,
  DesignationHolderRecord,
  MembershipInput,
  UserMembershipRecord,
} from "../../lib/types/user-affiliation/user-affiliation.type.js";

interface MembershipRow extends OrganisationalUnitRow {
  member_user_id: string;
  membership_assigned_at: Date;
}

interface AssignedDesignationRow extends DesignationReferenceRow {
  assignment_key: string;
}

interface MemberRow {
  user_id: string;
  full_name: string;
  email: string;
  membership_assigned_at: Date;
}

interface DesignationHolderRow {
  designation_id: string;
  organisational_unit_id: string;
  holder_id: string;
  holder_full_name: string;
  holder_email: string;
}

const MEMBERSHIP_SELECT = `
  SELECT ${ORGANISATIONAL_UNIT_COLUMNS}, uou.user_id AS member_user_id, uou.assigned_at AS membership_assigned_at
    FROM ${ORGANISATIONAL_UNIT_SOURCE}
    JOIN user_organisational_units uou ON uou.organisational_unit_id = ou.id`;

function groupDesignations(rows: readonly AssignedDesignationRow[]): Map<string, DesignationReference[]> {
  const grouped = new Map<string, DesignationReference[]>();
  for (const row of rows) {
    const designations = grouped.get(row.assignment_key) ?? [];
    designations.push(toDesignationReferenceFromRow(row));
    grouped.set(row.assignment_key, designations);
  }
  for (const designations of grouped.values()) designations.sort(compareDesignations);
  return grouped;
}

function flattenAssignments(memberships: readonly MembershipInput[]): { designationIds: string[]; unitIds: string[] } {
  const pairs = memberships.flatMap((membership) =>
    membership.designationIds.map((designationId) => ({ designationId, unitId: membership.organisationalUnitId })),
  );
  return { designationIds: pairs.map((pair) => pair.designationId), unitIds: pairs.map((pair) => pair.unitId) };
}

export class PostgresUserAffiliationRepository implements IUserAffiliationRepository {
  async findMembershipsByUserId(userId: string): Promise<UserMembershipRecord[]> {
    const [membershipRows, designationRows] = await Promise.all([
      query<MembershipRow>(`${MEMBERSHIP_SELECT} WHERE uou.user_id = $1`, [userId]),
      query<AssignedDesignationRow>(
        `SELECT ud.organisational_unit_id AS assignment_key, ${DESIGNATION_REFERENCE_COLUMNS}
           FROM user_designations ud
           JOIN designations d ON d.id = ud.designation_id
          WHERE ud.user_id = $1`,
        [userId],
      ),
    ]);

    const designationsByUnit = groupDesignations(designationRows);
    return membershipRows
      .map((row) => ({
        organisationalUnit: toOrganisationalUnitRecord(row),
        designations: designationsByUnit.get(row.id) ?? [],
        assignedAt: row.membership_assigned_at,
      }))
      .sort(compareMemberships);
  }

  async findUnitSummariesByUserIds(userIds: readonly string[]): Promise<Map<string, OrganisationalUnitReference[]>> {
    const summaries = new Map<string, OrganisationalUnitReference[]>(userIds.map((userId) => [userId, []]));
    if (userIds.length === 0) return summaries;

    const rows = await query<MembershipRow>(`${MEMBERSHIP_SELECT} WHERE uou.user_id = ANY($1::uuid[])`, [[...userIds]]);
    const unitsByUser = new Map<string, OrganisationalUnitRecord[]>();
    for (const row of rows) {
      const units = unitsByUser.get(row.member_user_id) ?? [];
      units.push(toOrganisationalUnitRecord(row));
      unitsByUser.set(row.member_user_id, units);
    }
    for (const [userId, units] of unitsByUser) {
      summaries.set(userId, units.sort(compareOrganisationalUnits).map(toOrganisationalUnitReference));
    }
    return summaries;
  }

  async findMembersByUnitId(organisationalUnitId: string): Promise<OrganisationalUnitMemberRecord[]> {
    const [memberRows, designationRows] = await Promise.all([
      query<MemberRow>(
        `SELECT u.id AS user_id, u.full_name, u.email, uou.assigned_at AS membership_assigned_at
           FROM user_organisational_units uou
           JOIN users u ON u.id = uou.user_id
          WHERE uou.organisational_unit_id = $1
          ORDER BY lower(u.full_name), u.id`,
        [organisationalUnitId],
      ),
      query<AssignedDesignationRow>(
        `SELECT ud.user_id AS assignment_key, ${DESIGNATION_REFERENCE_COLUMNS}
           FROM user_designations ud
           JOIN designations d ON d.id = ud.designation_id
          WHERE ud.organisational_unit_id = $1`,
        [organisationalUnitId],
      ),
    ]);

    const designationsByUser = groupDesignations(designationRows);
    return memberRows.map((row) => ({
      user: { id: row.user_id, fullName: row.full_name, email: row.email },
      designations: designationsByUser.get(row.user_id) ?? [],
      assignedAt: row.membership_assigned_at,
    }));
  }

  async findSingleHolders(keys: readonly DesignationAssignmentKey[]): Promise<DesignationHolderRecord[]> {
    if (keys.length === 0) return [];
    const rows = await query<DesignationHolderRow>(
      `SELECT ud.designation_id, ud.organisational_unit_id,
              u.id AS holder_id, u.full_name AS holder_full_name, u.email AS holder_email
         FROM user_designations ud
         JOIN unnest($1::uuid[], $2::uuid[]) AS requested (designation_id, organisational_unit_id)
           ON requested.designation_id = ud.designation_id
          AND requested.organisational_unit_id = ud.organisational_unit_id
         JOIN users u ON u.id = ud.user_id
        WHERE ud.single_holder_per_unit`,
      [keys.map((key) => key.designationId), keys.map((key) => key.organisationalUnitId)],
    );
    return rows.map((row) => ({
      designationId: row.designation_id,
      organisationalUnitId: row.organisational_unit_id,
      holder: { id: row.holder_id, fullName: row.holder_full_name, email: row.holder_email },
    }));
  }

  async replaceForUser(userId: string, memberships: readonly MembershipInput[], actorUserId: string | null): Promise<void> {
    const unitIds = memberships.map((membership) => membership.organisationalUnitId);
    const assignments = flattenAssignments(memberships);

    try {
      await withTransaction(async (client) => {
        await client.query(
          `DELETE FROM user_designations ud
            WHERE ud.user_id = $1
              AND NOT EXISTS (
                SELECT 1
                  FROM unnest($2::uuid[], $3::uuid[]) AS desired (designation_id, organisational_unit_id)
                 WHERE desired.designation_id = ud.designation_id
                   AND desired.organisational_unit_id = ud.organisational_unit_id
              )`,
          [userId, assignments.designationIds, assignments.unitIds],
        );
        await client.query(
          "DELETE FROM user_organisational_units WHERE user_id = $1 AND NOT (organisational_unit_id = ANY($2::uuid[]))",
          [userId, unitIds],
        );
        await client.query(
          `INSERT INTO user_organisational_units (user_id, organisational_unit_id, assigned_by_user_id)
           SELECT $1, unnest($2::uuid[]), $3
           ON CONFLICT ON CONSTRAINT user_organisational_units_pkey DO NOTHING`,
          [userId, unitIds, actorUserId],
        );
        await client.query(
          `INSERT INTO user_designations
             (user_id, designation_id, organisational_unit_id, unit_type, single_holder_per_unit, assigned_by_user_id)
           SELECT $1, desired.designation_id, desired.organisational_unit_id,
                  (SELECT ou.unit_type FROM organisational_units ou WHERE ou.id = desired.organisational_unit_id),
                  (SELECT d.single_holder_per_unit FROM designations d WHERE d.id = desired.designation_id),
                  $4
             FROM unnest($2::uuid[], $3::uuid[]) AS desired (designation_id, organisational_unit_id)
           ON CONFLICT ON CONSTRAINT user_designations_pkey DO NOTHING`,
          [userId, assignments.designationIds, assignments.unitIds, actorUserId],
        );
      });
    } catch (err) {
      if (isPostgresError(err, PostgresErrorCode.UNIQUE_VIOLATION, PostgresConstraint.USER_DESIGNATIONS_SINGLE_HOLDER_KEY)) {
        throw designationHolderConflict();
      }
      if (isPostgresError(err, PostgresErrorCode.CHECK_VIOLATION, PostgresConstraint.USER_ORGANISATIONAL_UNITS_DEPARTMENT_FACULTY_CHECK)) {
        throw facultyMembershipRequired();
      }
      throw err;
    }
  }
}
