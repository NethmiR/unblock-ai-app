import type { UserDto, UserRecord } from "../../lib/types/user/user.type.js";

export function serializeUser(record: UserRecord): UserDto {
  return {
    id: record.id,
    email: record.email,
    full_name: record.fullName,
    status: record.status,
    permissions: [...record.permissions],
    last_login_at: record.lastLoginAt?.toISOString() ?? null,
    created_by_user_id: record.createdByUserId,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  };
}
