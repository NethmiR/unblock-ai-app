import type { Permission } from "../../../data/constants/permission.constant.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  permissions: Permission[];
}

export interface AuthenticatedSession {
  id: string;
  expiresAt: Date;
}

export interface AuthContext {
  user: AuthenticatedUser;
  session: AuthenticatedSession;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: AuthenticatedUser;
}

export interface AuthenticatedUserDto {
  id: string;
  email: string;
  full_name: string;
  permissions: Permission[];
}

export interface LoginResponseDto {
  token: string;
  expires_at: string;
  user: AuthenticatedUserDto;
}

export interface CurrentUserResponseDto {
  user: AuthenticatedUserDto;
  session: { id: string; expires_at: string };
}
