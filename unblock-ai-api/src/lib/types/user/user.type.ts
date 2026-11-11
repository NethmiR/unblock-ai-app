import type { Permission } from "../../../data/constants/permission.constant.js";
import type { UserStatus } from "../../../data/constants/user.constant.js";

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
