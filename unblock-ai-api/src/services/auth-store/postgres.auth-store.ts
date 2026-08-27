import { query } from "../../db/postgres.client.js";
import type { IAuthStore } from "./auth-store.interface.js";
import type { AuthAudience, AuthUserRow } from "../../lib/types/auth/auth.type.js";

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
}
