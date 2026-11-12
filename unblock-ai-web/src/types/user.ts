import type { OrganisationalUnitReferenceDto } from "./organisational-unit";
import type { Permission } from "./permission";

export enum UserStatus {
  ACTIVE = "active",
  DISABLED = "disabled",
}

export enum UserErrorCode {
  EMAIL_ALREADY_REGISTERED = "EMAIL_ALREADY_REGISTERED",
  USER_NOT_FOUND = "USER_NOT_FOUND",
}

export interface UserReferenceDto {
  id: string;
  full_name: string;
  email: string;
}

export interface UserDto {
  id: string;
  email: string;
  full_name: string;
  status: UserStatus;
  permissions: Permission[];
  last_login_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserListItemDto extends UserDto {
  organisational_units: OrganisationalUnitReferenceDto[];
}

export interface UserListPageDto {
  total: number;
  limit: number;
  offset: number;
}

export interface UserListQuery {
  search?: string;
  organisational_unit_id?: string;
  limit?: number;
  offset?: number;
}

export interface UserListResponse {
  users: UserListItemDto[];
  page: UserListPageDto;
}

export interface UserResponse {
  user: UserDto;
}

export interface CreateUserRequest {
  email: string;
  full_name: string;
  permissions: Permission[];
}
