import type { AuthAudience, AuthUserRow } from "../../lib/types/auth/auth.type.js";

/**
 * D-5: auth data access behind an interface, same pattern as IVectorStore and
 * IMailer. Gives `node:test` a real, in-process store with no live Postgres.
 */
export interface IAuthStore {
  findByUsername(audience: AuthAudience, username: string): Promise<AuthUserRow | null>;
  findById(audience: AuthAudience, id: string): Promise<AuthUserRow | null>;

  /** Success path: stamp last_login_at and RESET the failure counter. */
  recordSuccessfulLogin(audience: AuthAudience, id: string, at: Date): Promise<void>;

  /** Failure path: atomically increment failed_attempt_count, stamp last_failed_attempt_at. */
  recordFailedAttempt(audience: AuthAudience, id: string, at: Date): Promise<number>;
}
