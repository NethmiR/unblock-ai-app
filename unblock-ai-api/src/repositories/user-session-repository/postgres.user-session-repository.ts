import { query } from "../../db/postgres.client.js";
import type { UserSessionRevocationReason } from "../../data/constants/user-session.constant.js";
import type { IUserSessionRepository } from "./user-session-repository.interface.js";
import type {
  CreateUserSessionRecordInput,
  UserSessionRecord,
} from "../../lib/types/user-session/user-session.type.js";

interface UserSessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  user_agent: string | null;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  revocation_reason: UserSessionRevocationReason | null;
}

const USER_SESSION_COLUMNS = `id, user_id, token_hash, user_agent, created_at, last_seen_at,
          expires_at, revoked_at, revocation_reason`;

function toUserSessionRecord(row: UserSessionRow): UserSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revocationReason: row.revocation_reason,
  };
}

export class PostgresUserSessionRepository implements IUserSessionRepository {
  async create(input: CreateUserSessionRecordInput): Promise<UserSessionRecord> {
    const rows = await query<UserSessionRow>(
      `INSERT INTO user_sessions (user_id, token_hash, user_agent, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING ${USER_SESSION_COLUMNS}`,
      [input.userId, input.tokenHash, input.userAgent, input.expiresAt],
    );
    return toUserSessionRecord(rows[0]!);
  }

  async findActiveByTokenHash(tokenHash: string, now: Date): Promise<UserSessionRecord | null> {
    const rows = await query<UserSessionRow>(
      `SELECT ${USER_SESSION_COLUMNS} FROM user_sessions
        WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2
        LIMIT 1`,
      [tokenHash, now],
    );
    return rows[0] ? toUserSessionRecord(rows[0]) : null;
  }

  async listActiveByUserId(userId: string, now: Date): Promise<UserSessionRecord[]> {
    const rows = await query<UserSessionRow>(
      `SELECT ${USER_SESSION_COLUMNS} FROM user_sessions
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $2
        ORDER BY created_at DESC, id`,
      [userId, now],
    );
    return rows.map(toUserSessionRecord);
  }

  async touch(id: string, at: Date): Promise<void> {
    await query("UPDATE user_sessions SET last_seen_at = $2 WHERE id = $1", [id, at]);
  }

  async revoke(id: string, userId: string, reason: UserSessionRevocationReason, at: Date): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `UPDATE user_sessions SET revoked_at = $4, revocation_reason = $3
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > $4
        RETURNING id`,
      [id, userId, reason, at],
    );
    return rows.length > 0;
  }

  async revokeAllExcept(
    userId: string,
    keepSessionId: string,
    reason: UserSessionRevocationReason,
    at: Date,
  ): Promise<number> {
    const rows = await query<{ id: string }>(
      `UPDATE user_sessions SET revoked_at = $4, revocation_reason = $3
        WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL AND expires_at > $4
        RETURNING id`,
      [userId, keepSessionId, reason, at],
    );
    return rows.length;
  }

  async deleteExpiredByUserId(userId: string, now: Date): Promise<number> {
    const rows = await query<{ id: string }>(
      "DELETE FROM user_sessions WHERE user_id = $1 AND expires_at <= $2 RETURNING id",
      [userId, now],
    );
    return rows.length;
  }
}
