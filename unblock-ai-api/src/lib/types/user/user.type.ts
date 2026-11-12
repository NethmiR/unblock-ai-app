import type { Permission } from "../../../data/constants/permission.constant.js";
import type { UserStatus } from "../../../data/constants/user.constant.js";
import type {
  OrganisationalUnitReference,
  OrganisationalUnitReferenceDto,
} from "../organisational-unit/organisational-unit.type.js";

export interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  permissions: Permission[];
  failedLoginCount: number;
  lastFailedLoginAt: Date | null;
  lastLoginAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCredentialRecord extends UserRecord {
  passwordHash: string;
}

export interface CreateUserRecordInput {
  email: string;
  fullName: string;
  passwordHash: string;
  permissions: Permission[];
  createdByUserId: string | null;
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  permissions: readonly string[];
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

export interface UserReference {
  id: string;
  fullName: string;
  email: string;
}

export interface UserReferenceDto {
  id: string;
  full_name: string;
  email: string;
}

export interface UserListFilter {
  search: string | null;
  organisationalUnitId: string | null;
  limit: number;
  offset: number;
}

export interface UserListPage {
  users: UserRecord[];
  total: number;
}

export interface UserListItemRecord extends UserRecord {
  organisationalUnits: OrganisationalUnitReference[];
}

export interface UserListResult {
  users: UserListItemRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface UserListItemDto extends UserDto {
  organisational_units: OrganisationalUnitReferenceDto[];
}

export interface UserListResponseDto {
  users: UserListItemDto[];
  page: { total: number; limit: number; offset: number };
}
