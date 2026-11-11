import { query, withTransaction } from "../../db/postgres.client.js";
import { ConflictError } from "../../errors/conflict.error.js";
import { ValidationError } from "../../errors/validation.error.js";
import { UserErrorCode } from "../../data/constants/user-error.constant.js";
import { PostgresConstraint, PostgresErrorCode } from "../../data/constants/postgres.constant.js";
import { isPostgresError } from "../../utils/database/postgres-error.util.js";
import type { Permission } from "../../data/constants/permission.constant.js";
import type { UserStatus } from "../../data/constants/user.constant.js";
import type { IUserRepository } from "./user-repository.interface.js";
import type { CreateUserRecordInput, UserCredentialRecord, UserRecord } from "../../lib/types/user/user.type.js";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  status: UserStatus;
  permissions: Permission[];
  failed_login_count: number;
  last_failed_login_at: Date | null;
  last_login_at: Date | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const USER_SELECT = `
  SELECT u.id, u.email, u.full_name, u.password_hash, u.status,
         COALESCE(
           array_agg(up.permission_code ORDER BY up.permission_code) FILTER (WHERE up.permission_code IS NOT NULL),
           '{}'
         ) AS permissions,
         u.failed_login_count, u.last_failed_login_at, u.last_login_at,
         u.created_by_user_id, u.created_at, u.updated_at
    FROM users u
    LEFT JOIN user_permissions up ON up.user_id = u.id`;

const USER_GROUP_BY = "GROUP BY u.id";

function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    status: row.status,
    permissions: row.permissions,
    failedLoginCount: row.failed_login_count,
    lastFailedLoginAt: row.last_failed_login_at,
    lastLoginAt: row.last_login_at,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toUserCredentialRecord(row: UserRow): UserCredentialRecord {
  return { ...toUserRecord(row), passwordHash: row.password_hash };
}

export class PostgresUserRepository implements IUserRepository {
  async findById(id: string): Promise<UserRecord | null> {
    const rows = await query<UserRow>(`${USER_SELECT} WHERE u.id = $1 ${USER_GROUP_BY}`, [id]);
    return rows[0] ? toUserRecord(rows[0]) : null;
  }

  async findCredentialByEmail(email: string): Promise<UserCredentialRecord | null> {
    const rows = await query<UserRow>(`${USER_SELECT} WHERE lower(u.email) = lower($1) ${USER_GROUP_BY}`, [email]);
    return rows[0] ? toUserCredentialRecord(rows[0]) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const rows = await query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower($1)) AS exists",
      [email],
    );
    return rows[0]?.exists ?? false;
  }

  async list(): Promise<UserRecord[]> {
    const rows = await query<UserRow>(`${USER_SELECT} ${USER_GROUP_BY} ORDER BY lower(u.full_name), u.id`);
    return rows.map(toUserRecord);
  }

  async create(input: CreateUserRecordInput): Promise<UserRecord> {
    if (input.permissions.length === 0) {
      throw new ValidationError("A user must hold at least one permission");
    }

    try {
      const userId = await withTransaction(async (client) => {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO users (email, full_name, password_hash, created_by_user_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [input.email, input.fullName, input.passwordHash, input.createdByUserId],
        );
        const id = inserted.rows[0]!.id;
        await client.query(
          `INSERT INTO user_permissions (user_id, permission_code, granted_by_user_id)
           SELECT $1, unnest($2::text[]), $3`,
          [id, input.permissions, input.createdByUserId],
        );
        return id;
      });

      const created = await this.findById(userId);
      return created!;
    } catch (err) {
      if (isPostgresError(err, PostgresErrorCode.UNIQUE_VIOLATION, PostgresConstraint.USERS_EMAIL_KEY)) {
        throw new ConflictError(`A user with email '${input.email}' already exists`, {
          code: UserErrorCode.EMAIL_ALREADY_REGISTERED,
        });
      }
      throw err;
    }
  }

  async recordSuccessfulLogin(id: string, at: Date): Promise<void> {
    await query(
      `UPDATE users
          SET last_login_at = $2, failed_login_count = 0, last_failed_login_at = NULL, updated_at = $2
        WHERE id = $1`,
      [id, at],
    );
  }

  async recordFailedLogin(id: string, at: Date, failureWindowStart: Date): Promise<number> {
    const rows = await query<{ failed_login_count: number }>(
      `UPDATE users
          SET failed_login_count = CASE
                WHEN last_failed_login_at IS NULL OR last_failed_login_at < $3 THEN 1
                ELSE failed_login_count + 1
              END,
              last_failed_login_at = $2,
              updated_at = $2
        WHERE id = $1
        RETURNING failed_login_count`,
      [id, at, failureWindowStart],
    );
    return rows[0]?.failed_login_count ?? 0;
  }
}
