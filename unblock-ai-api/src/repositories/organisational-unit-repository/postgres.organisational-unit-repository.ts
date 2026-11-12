import { query } from "../../db/postgres.client.js";
import { PostgresConstraint, PostgresErrorCode } from "../../data/constants/postgres.constant.js";
import { isPostgresError } from "../../utils/database/postgres-error.util.js";
import { SqlAssignmentBuilder, SqlParameters, SqlWhereBuilder } from "../../utils/database/sql-builder.util.js";
import { compareOrganisationalUnits } from "../../utils/user-affiliation/membership-order.util.js";
import {
  departmentWithMembersCannotMove,
  organisationalUnitCodeTaken,
  organisationalUnitInUse,
  organisationalUnitNameTaken,
  organisationalUnitNotFound,
  organisationalUnitParentInvalid,
} from "../../errors/organisational-unit.error.js";
import {
  ORGANISATIONAL_UNIT_COLUMNS,
  ORGANISATIONAL_UNIT_SOURCE,
  ORGANISATIONAL_UNIT_USAGE_COLUMNS,
  toOrganisationalUnitRecord,
  toOrganisationalUnitSummaryRecord,
  type OrganisationalUnitRow,
  type OrganisationalUnitSummaryRow,
} from "./postgres.organisational-unit-row.js";
import type { IOrganisationalUnitRepository } from "./organisational-unit-repository.interface.js";
import type {
  CreateOrganisationalUnitRecordInput,
  OrganisationalUnitListFilter,
  OrganisationalUnitRecord,
  OrganisationalUnitSummaryRecord,
  UpdateOrganisationalUnitRecordInput,
} from "../../lib/types/organisational-unit/organisational-unit.type.js";

const SUMMARY_SELECT = `SELECT ${ORGANISATIONAL_UNIT_COLUMNS}, ${ORGANISATIONAL_UNIT_USAGE_COLUMNS} FROM ${ORGANISATIONAL_UNIT_SOURCE}`;
const RECORD_SELECT = `SELECT ${ORGANISATIONAL_UNIT_COLUMNS} FROM ${ORGANISATIONAL_UNIT_SOURCE}`;

function mapWriteError(err: unknown, attempted: { code?: string; name?: string }): never {
  if (attempted.code !== undefined && isPostgresError(err, PostgresErrorCode.UNIQUE_VIOLATION, PostgresConstraint.ORGANISATIONAL_UNITS_CODE_KEY)) {
    throw organisationalUnitCodeTaken(attempted.code);
  }
  if (
    attempted.name !== undefined &&
    (isPostgresError(err, PostgresErrorCode.UNIQUE_VIOLATION, PostgresConstraint.ORGANISATIONAL_UNITS_ROOT_NAME_KEY) ||
      isPostgresError(err, PostgresErrorCode.UNIQUE_VIOLATION, PostgresConstraint.ORGANISATIONAL_UNITS_CHILD_NAME_KEY))
  ) {
    throw organisationalUnitNameTaken(attempted.name);
  }
  if (isPostgresError(err, PostgresErrorCode.FOREIGN_KEY_VIOLATION, PostgresConstraint.ORGANISATIONAL_UNITS_PARENT_FKEY)) {
    throw organisationalUnitParentInvalid("The parent organisational unit does not exist");
  }
  throw err;
}

export class PostgresOrganisationalUnitRepository implements IOrganisationalUnitRepository {
  async list(filter: OrganisationalUnitListFilter): Promise<OrganisationalUnitSummaryRecord[]> {
    const parameters = new SqlParameters();
    const where = new SqlWhereBuilder(parameters);
    if (filter.unitType !== null) where.where(`ou.unit_type = ${where.parameter(filter.unitType)}`);
    if (filter.rootOnly) where.where("ou.parent_id IS NULL");
    if (filter.parentId !== null) where.where(`ou.parent_id = ${where.parameter(filter.parentId)}`);
    if (!filter.includeArchived) where.where("ou.archived_at IS NULL");

    const rows = await query<OrganisationalUnitSummaryRow>(`${SUMMARY_SELECT} ${where.toSql()}`, parameters.toArray());
    return rows.map(toOrganisationalUnitSummaryRecord).sort(compareOrganisationalUnits);
  }

  async findById(id: string): Promise<OrganisationalUnitSummaryRecord | null> {
    const rows = await query<OrganisationalUnitSummaryRow>(`${SUMMARY_SELECT} WHERE ou.id = $1`, [id]);
    return rows[0] ? toOrganisationalUnitSummaryRecord(rows[0]) : null;
  }

  async findByIds(ids: readonly string[]): Promise<OrganisationalUnitRecord[]> {
    if (ids.length === 0) return [];
    const rows = await query<OrganisationalUnitRow>(`${RECORD_SELECT} WHERE ou.id = ANY($1::uuid[])`, [[...ids]]);
    return rows.map(toOrganisationalUnitRecord);
  }

  async findByCode(code: string): Promise<OrganisationalUnitRecord | null> {
    const rows = await query<OrganisationalUnitRow>(`${RECORD_SELECT} WHERE ou.code = $1`, [code]);
    return rows[0] ? toOrganisationalUnitRecord(rows[0]) : null;
  }

  async create(input: CreateOrganisationalUnitRecordInput): Promise<OrganisationalUnitSummaryRecord> {
    try {
      const rows = await query<{ id: string }>(
        `INSERT INTO organisational_units (code, name, unit_type, parent_id, parent_unit_type, description, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          input.code,
          input.name,
          input.unitType,
          input.parent?.id ?? null,
          input.parent?.unitType ?? null,
          input.description,
          input.createdByUserId,
        ],
      );
      return this.requireById(rows[0]!.id);
    } catch (err) {
      mapWriteError(err, { code: input.code, name: input.name });
    }
  }

  async update(id: string, input: UpdateOrganisationalUnitRecordInput): Promise<OrganisationalUnitSummaryRecord> {
    const parameters = new SqlParameters();
    const idParameter = parameters.add(id);
    const assignments = new SqlAssignmentBuilder(parameters);
    if (input.name !== undefined) assignments.set("name", input.name);
    if (input.parent !== undefined) {
      assignments.set("parent_id", input.parent?.id ?? null).set("parent_unit_type", input.parent?.unitType ?? null);
    }
    if (input.description !== undefined) assignments.set("description", input.description);
    assignments.setExpression("updated_at", "now()");

    try {
      const rows = await query<{ id: string }>(
        `UPDATE organisational_units SET ${assignments.toSql()} WHERE id = ${idParameter} RETURNING id`,
        parameters.toArray(),
      );
      if (!rows[0]) throw organisationalUnitNotFound(id);
      return this.requireById(id);
    } catch (err) {
      if (isPostgresError(err, PostgresErrorCode.CHECK_VIOLATION, PostgresConstraint.USER_ORGANISATIONAL_UNITS_DEPARTMENT_FACULTY_CHECK)) {
        throw departmentWithMembersCannotMove((await this.findById(id))?.memberCount ?? 0);
      }
      mapWriteError(err, { name: input.name });
    }
  }

  async setArchivedAt(id: string, archivedAt: Date | null): Promise<OrganisationalUnitSummaryRecord> {
    const rows = await query<{ id: string }>(
      "UPDATE organisational_units SET archived_at = $2, updated_at = now() WHERE id = $1 RETURNING id",
      [id, archivedAt],
    );
    if (!rows[0]) throw organisationalUnitNotFound(id);
    return this.requireById(id);
  }

  async delete(id: string): Promise<void> {
    try {
      const rows = await query<{ id: string }>("DELETE FROM organisational_units WHERE id = $1 RETURNING id", [id]);
      if (!rows[0]) throw organisationalUnitNotFound(id);
    } catch (err) {
      if (isPostgresError(err, PostgresErrorCode.FOREIGN_KEY_VIOLATION)) {
        const unit = await this.findById(id);
        throw organisationalUnitInUse({ memberCount: unit?.memberCount ?? 0, childCount: unit?.childCount ?? 0 });
      }
      throw err;
    }
  }

  private async requireById(id: string): Promise<OrganisationalUnitSummaryRecord> {
    const unit = await this.findById(id);
    if (!unit) throw organisationalUnitNotFound(id);
    return unit;
  }
}
