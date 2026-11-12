import { serializeOrganisationalUnitReference } from "./organisational-unit-serializer.util.js";
import type {
  UserDto,
  UserListItemDto,
  UserListItemRecord,
  UserListResponseDto,
  UserListResult,
  UserRecord,
  UserReference,
  UserReferenceDto,
} from "../../lib/types/user/user.type.js";

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

export function serializeUserReference(user: UserReference): UserReferenceDto {
  return { id: user.id, full_name: user.fullName, email: user.email };
}

export function serializeUserListItem(record: UserListItemRecord): UserListItemDto {
  return {
    ...serializeUser(record),
    organisational_units: record.organisationalUnits.map(serializeOrganisationalUnitReference),
  };
}

export function serializeUserListResult(result: UserListResult): UserListResponseDto {
  return {
    users: result.users.map(serializeUserListItem),
    page: { total: result.total, limit: result.limit, offset: result.offset },
  };
}
