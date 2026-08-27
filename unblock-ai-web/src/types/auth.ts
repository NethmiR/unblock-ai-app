/**
 * TypeScript mirror of unblock-ai-api/src/lib/types/auth/auth.type.ts.
 *
 * WHEN THE SCHEMA CHANGES, CHANGE THIS FILE IN THE SAME COMMIT.
 * There is no codegen step; this is a hand-maintained contract, and a drifted
 * contract produces `undefined` at runtime with no compile error.
 */
export type AuthAudience = "admin" | "portal";

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
