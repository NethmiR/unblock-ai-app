import type { PoolClient } from "pg";
import { query, withTransaction } from "../../db/postgres.client.js";
import { PostgresConstraint, PostgresErrorCode } from "../../data/constants/postgres.constant.js";
import {
  ORGANISATIONAL_UNIT_TYPES,
  type OrganisationalUnitType,
} from "../../data/constants/organisational-unit.constant.js";
import { isPostgresError } from "../../utils/database/postgres-error.util.js";
import { SqlAssignmentBuilder, SqlParameters } from "../../utils/database/sql-builder.util.js";
import { emptyCountByUnitType } from "../../utils/organisation/organisational-unit-type.util.js";
import { compareDesignations } from "../../utils/organisation/designation-reference.util.js";
import {
  designationCodeTaken,
  designationInUse,
  designationNotFound,
  designationSingleHolderViolated,
  designationTitleTaken,
  designationUnitTypeInUse,
} from "../../errors/designation.error.js";
import {
  DESIGNATION_COLUMNS,
  DESIGNATION_HOLDER_COUNT_COLUMN,
  toDesignationRecord,
  toDesignationSummaryRecord,
  type DesignationRow,
  type DesignationSummaryRow,
} from "./postgres.designation-row.js";
import type { IDesignationRepository } from "./designation-repository.interface.js";
import type {
  CreateDesignationRecordInput,
  DesignationHolderCountByUnitType,
  DesignationRecord,
  DesignationSummaryRecord,
  UpdateDesignationInput,
} from "../../lib/types/designation/designation.type.js";

const SUMMARY_SELECT = `SELECT ${DESIGNATION_COLUMNS}, ${DESIGNATION_HOLDER_COUNT_COLUMN} FROM designations d`;
const RECORD_SELECT = `SELECT ${DESIGNATION_COLUMNS} FROM designations d`;

async function insertUnitTypes(client: PoolClient, designationId: string, unitTypes: readonly OrganisationalUnitType[]): Promise<void> {
  await client.query(
    `INSERT INTO designation_unit_types (designation_id, unit_type)
     SELECT $1, unnest($2::text[])
     ON CONFLICT ON CONSTRAINT designation_unit_types_pkey DO NOTHING`,
    [designationId, [...unitTypes]],
  );
}

export class PostgresDesignationRepository implements IDesignationRepository {
  async list(includeArchived: boolean): Promise<DesignationSummaryRecord[]> {
    const where = includeArchived ? "" : "WHERE d.archived_at IS NULL";
    const rows = await query<DesignationSummaryRow>(`${SUMMARY_SELECT} ${where}`);
    return rows.map(toDesignationSummaryRecord).sort(compareDesignations);
  }

  async findById(id: string): Promise<DesignationSummaryRecord | null> {
    const rows = await query<DesignationSummaryRow>(`${SUMMARY_SELECT} WHERE d.id = $1`, [id]);
    return rows[0] ? toDesignationSummaryRecord(rows[0]) : null;
  }

  async findByIds(ids: readonly string[]): Promise<DesignationRecord[]> {
    if (ids.length === 0) return [];
    const rows = await query<DesignationRow>(`${RECORD_SELECT} WHERE d.id = ANY($1::uuid[])`, [[...ids]]);
    return rows.map(toDesignationRecord);
  }

  async findByCode(code: string): Promise<DesignationRecord | null> {
    const rows = await query<DesignationRow>(`${RECORD_SELECT} WHERE d.code = $1`, [code]);
    return rows[0] ? toDesignationRecord(rows[0]) : null;
  }

  async countHoldersByUnitType(id: string): Promise<DesignationHolderCountByUnitType> {
    const rows = await query<{ unit_type: OrganisationalUnitType; holder_count: number }>(
      `SELECT unit_type, count(*)::int AS holder_count
         FROM user_designations
        WHERE designation_id = $1
        GROUP BY unit_type`,
      [id],
    );
    const counts = emptyCountByUnitType();
    for (const row of rows) counts[row.unit_type] = row.holder_count;
    return counts;
  }

  async findUnitsWithMultipleHolders(id: string): Promise<string[]> {
    const rows = await query<{ organisational_unit_id: string }>(
      `SELECT organisational_unit_id
         FROM user_designations
        WHERE designation_id = $1
        GROUP BY organisational_unit_id
       HAVING count(*) > 1`,
      [id],
    );
    return rows.map((row) => row.organisational_unit_id);
  }

  async create(input: CreateDesignationRecordInput): Promise<DesignationSummaryRecord> {
    try {
      const id = await withTransaction(async (client) => {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO designations (code, title, category, single_holder_per_unit, display_order, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [input.code, input.title, input.category, input.singleHolderPerUnit, input.displayOrder, input.createdByUserId],
        );
        const designationId = inserted.rows[0]!.id;
        await insertUnitTypes(client, designationId, input.applicableUnitTypes);
        return designationId;
      });
      return this.requireById(id);
    } catch (err) {
      if (isPostgresError(err, PostgresErrorCode.UNIQUE_VIOLATION, PostgresConstraint.DESIGNATIONS_CODE_KEY)) {
        throw designationCodeTaken(input.code);
      }
      if (isPostgresError(err, PostgresErrorCode.UNIQUE_VIOLATION, PostgresConstraint.DESIGNATIONS_TITLE_KEY)) {
        throw designationTitleTaken(input.title);
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateDesignationInput): Promise<DesignationSummaryRecord> {
    const parameters = new SqlParameters();
    const idParameter = parameters.add(id);
    const assignments = new SqlAssignmentBuilder(parameters);
    if (input.title !== undefined) assignments.set("title", input.title);
    if (input.category !== undefined) assignments.set("category", input.category);
    if (input.singleHolderPerUnit !== undefined) assignments.set("single_holder_per_unit", input.singleHolderPerUnit);
    if (input.displayOrder !== undefined) assignments.set("display_order", input.displayOrder);
    assignments.setExpression("updated_at", "now()");

    let found: boolean;
    try {
      found = await withTransaction(async (client) => {
        const updated = await client.query(
          `UPDATE designations SET ${assignments.toSql()} WHERE id = ${idParameter} RETURNING id`,
          parameters.toArray(),
        );
        if (updated.rowCount === 0) return false;
        if (input.applicableUnitTypes !== undefined) {
          await client.query(
            "DELETE FROM designation_unit_types WHERE designation_id = $1 AND NOT (unit_type = ANY($2::text[]))",
            [id, [...input.applicableUnitTypes]],
          );
          await insertUnitTypes(client, id, input.applicableUnitTypes);
        }
        return true;
      });
    } catch (err) {
      if (input.title !== undefined && isPostgresError(err, PostgresErrorCode.UNIQUE_VIOLATION, PostgresConstraint.DESIGNATIONS_TITLE_KEY)) {
        throw designationTitleTaken(input.title);
      }
      if (isPostgresError(err, PostgresErrorCode.UNIQUE_VIOLATION, PostgresConstraint.USER_DESIGNATIONS_SINGLE_HOLDER_KEY)) {
        throw designationSingleHolderViolated(await this.findUnitsWithMultipleHolders(id));
      }
      if (isPostgresError(err, PostgresErrorCode.FOREIGN_KEY_VIOLATION, PostgresConstraint.USER_DESIGNATIONS_DESIGNATION_UNIT_TYPE_FKEY)) {
        const counts = await this.countHoldersByUnitType(id);
        const blockedUnitType = ORGANISATIONAL_UNIT_TYPES.find(
          (unitType) => counts[unitType] > 0 && !input.applicableUnitTypes?.includes(unitType),
        );
        if (blockedUnitType) throw designationUnitTypeInUse(blockedUnitType, counts[blockedUnitType]);
      }
      throw err;
    }
    if (!found) throw designationNotFound(id);
    return this.requireById(id);
  }

  async setArchivedAt(id: string, archivedAt: Date | null): Promise<DesignationSummaryRecord> {
    const rows = await query<{ id: string }>(
      "UPDATE designations SET archived_at = $2, updated_at = now() WHERE id = $1 RETURNING id",
      [id, archivedAt],
    );
    if (!rows[0]) throw designationNotFound(id);
    return this.requireById(id);
  }

  async delete(id: string): Promise<void> {
    try {
      const rows = await query<{ id: string }>("DELETE FROM designations WHERE id = $1 RETURNING id", [id]);
      if (!rows[0]) throw designationNotFound(id);
    } catch (err) {
      if (isPostgresError(err, PostgresErrorCode.FOREIGN_KEY_VIOLATION)) {
        throw designationInUse((await this.findById(id))?.holderCount ?? 0);
      }
      throw err;
    }
  }

  private async requireById(id: string): Promise<DesignationSummaryRecord> {
    const designation = await this.findById(id);
    if (!designation) throw designationNotFound(id);
    return designation;
  }
}
