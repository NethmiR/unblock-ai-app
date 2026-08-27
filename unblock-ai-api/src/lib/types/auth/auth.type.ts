export type AuthAudience = "admin" | "portal";

/** Row shape shared by admin_users and portal_users. `faculty` is NULL for admins. */
export interface AuthUserRow {
  id: string;
  username: string;
  email: string;
  full_name: string;
  department: string | null;
  organisation: string | null;
  faculty: string | null;
  password_hash: string;
  is_active: boolean;
  last_login_at: Date | null;
  failed_attempt_count: number;
  last_failed_attempt_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** What a request actually gets back - never includes password_hash. */
export interface AuthUser {
  id: string;
  audience: AuthAudience;
  username: string;
  email: string;
  full_name: string;
  department: string | null;
  organisation: string | null;
  faculty: string | null;
}

/** HMAC-signed stateless session cookie payload (D-3). */
export interface SessionPayload {
  sub: string;
  aud: AuthAudience;
  usr: string;
  exp: number;
}

export interface LoginCredentials {
  audience: AuthAudience;
  username: string;
  password: string;
}

export interface LoginResult {
  token: string;
  expires_at: string;
  user: AuthUser;
}
