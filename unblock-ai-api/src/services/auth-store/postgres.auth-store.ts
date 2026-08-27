import { query } from "../../db/postgres.client.js";
import type { IAuthStore } from "./auth-store.interface.js";
import type {
  AuthAudience,
  AuthUserRow,
  TemplateDeletionInput,
  TemplateDeletionRecord,
} from "../../lib/types/auth/auth.type.js";

const DELETION_COLUMNS = `id, workflow_id, template_title, latest_version, versions_removed,
          institution_type, review_status, deleted_by_admin_id, deleted_by_username,
          reason, request_id, snapshot, deleted_at`;

// Frozen lookup, never string interpolation of caller input - `audience` is a
// validated union at the type level, so this only ever resolves to one of two
// literal identifiers.
const TABLE = { admin: "admin_users", portal: "portal_users" } as const;

// admin_users has no faculty column; select a literal NULL in its place so both
// tables produce the same AuthUserRow shape.
const FACULTY_COLUMN = { admin: "NULL::text AS faculty", portal: "faculty" } as const;

function selectColumns(audience: AuthAudience): string {
  return `id, username, email, full_name, department, organisation, ${FACULTY_COLUMN[audience]},
          password_hash, is_active, last_login_at, failed_attempt_count, last_failed_attempt_at,
          created_at, updated_at`;
}

export class PostgresAuthStore implements IAuthStore {
  async findByUsername(audience: AuthAudience, username: string): Promise<AuthUserRow | null> {
    const rows = await query<AuthUserRow>(
      `SELECT ${selectColumns(audience)} FROM ${TABLE[audience]} WHERE lower(username) = lower($1) LIMIT 1`,
      [username],
    );
    return rows[0] ?? null;
  }

  async findById(audience: AuthAudience, id: string): Promise<AuthUserRow | null> {
    const rows = await query<AuthUserRow>(
      `SELECT ${selectColumns(audience)} FROM ${TABLE[audience]} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async recordSuccessfulLogin(audience: AuthAudience, id: string, at: Date): Promise<void> {
    await query(
      `UPDATE ${TABLE[audience]}
          SET last_login_at = $2, failed_attempt_count = 0, updated_at = $2
        WHERE id = $1`,
      [id, at],
    );
  }

  async recordFailedAttempt(audience: AuthAudience, id: string, at: Date): Promise<number> {
    const rows = await query<{ failed_attempt_count: number }>(
      `UPDATE ${TABLE[audience]}
          SET failed_attempt_count = failed_attempt_count + 1, last_failed_attempt_at = $2, updated_at = $2
        WHERE id = $1
        RETURNING failed_attempt_count`,
      [id, at],
    );
    return rows[0]?.failed_attempt_count ?? 0;
  }

  async recordTemplateDeletion(input: TemplateDeletionInput): Promise<TemplateDeletionRecord> {
    const rows = await query<TemplateDeletionRecord>(
      `INSERT INTO template_deletions
         (workflow_id, template_title, latest_version, institution_type, review_status,
          deleted_by_admin_id, deleted_by_username, reason, request_id, snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${DELETION_COLUMNS}`,
      [
        input.workflow_id,
        input.template_title,
        input.latest_version,
        input.institution_type,
        input.review_status,
        input.admin_id,
        input.admin_username,
        input.reason,
        input.request_id,
        JSON.stringify(input.snapshot),
      ],
    );
    return rows[0]!;
  }

  async markDeletionCompleted(id: string, versionsRemoved: number): Promise<void> {
    await query(`UPDATE template_deletions SET versions_removed = $2 WHERE id = $1`, [id, versionsRemoved]);
  }

  async listTemplateDeletions(limit: number, workflowId?: string): Promise<TemplateDeletionRecord[]> {
    if (workflowId) {
      return query<TemplateDeletionRecord>(
        `SELECT ${DELETION_COLUMNS} FROM template_deletions WHERE workflow_id = $1 ORDER BY deleted_at DESC LIMIT $2`,
        [workflowId, limit],
      );
    }
    return query<TemplateDeletionRecord>(
      `SELECT ${DELETION_COLUMNS} FROM template_deletions ORDER BY deleted_at DESC LIMIT $1`,
      [limit],
    );
  }
}
