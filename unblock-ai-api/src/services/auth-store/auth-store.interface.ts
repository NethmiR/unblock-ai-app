import type {
  AuthAudience,
  AuthUserRow,
  TemplateDeletionInput,
  TemplateDeletionRecord,
} from "../../lib/types/auth/auth.type.js";

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

  /** Written BEFORE the Mongo delete - `versions_removed` starts at 0. */
  recordTemplateDeletion(input: TemplateDeletionInput): Promise<TemplateDeletionRecord>;
  /** Called once the Mongo delete has confirmed how many versions it removed. */
  markDeletionCompleted(id: string, versionsRemoved: number): Promise<void>;
  listTemplateDeletions(limit: number, workflowId?: string): Promise<TemplateDeletionRecord[]>;
}
