import type { Permission } from "./permission";

export enum AuthErrorCode {
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  ACCOUNT_LOCKED = "ACCOUNT_LOCKED",
  ACCOUNT_DISABLED = "ACCOUNT_DISABLED",
  AUTHENTICATION_REQUIRED = "AUTHENTICATION_REQUIRED",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  USER_SESSION_NOT_FOUND = "USER_SESSION_NOT_FOUND",
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  full_name: string;
  permissions: Permission[];
}

/** The signed-in user as the web app holds it: the `/auth/me` user plus derived display fields. */
export interface CurrentSession {
  user: AuthenticatedUser;
  sessionId: string;
  initials: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  expires_at: string;
  user: AuthenticatedUser;
}

export interface CurrentUserResponse {
  user: AuthenticatedUser;
  session: { id: string; expires_at: string };
}

export interface UserSession {
  id: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  is_current: boolean;
}

export interface UserSessionListResponse {
  sessions: UserSession[];
}

export interface RevokeOtherUserSessionsResponse {
  revoked_count: number;
}
