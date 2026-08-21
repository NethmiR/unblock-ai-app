import type { ObjectId } from "mongodb";

/** What was acted on. One entry per deletion; extend as more auditable actions appear. */
export type AuditResource = "task" | "template";

export type AuditAction = "deleted";

/**
 * Who performed the action.
 *
 * There is no authentication yet, so every field is nullable and the server
 * fills what it can. Once login ships, the middleware populates `id`/`email`
 * from the session instead of leaving them null - nothing else has to change.
 */
export interface AuditActor {
  id: string | null;
  email: string | null;
  role: string | null;
}

/**
 * An immutable record of a destructive action, written BEFORE the delete so a
 * failed delete leaves a visible trail rather than a silent gap.
 *
 * `snapshot` keeps the identifying fields of the removed document (reference,
 * title, status) - the row itself is gone, so the log is the only place left
 * that can answer "what was deleted".
 */
export interface AuditLogDocument {
  _id: ObjectId;
  resource: AuditResource;
  resource_id: string;
  action: AuditAction;
  actor: AuditActor;
  snapshot: Record<string, unknown>;
  reason: string | null;
  request_id: string | null;
  created_at: Date;
}
