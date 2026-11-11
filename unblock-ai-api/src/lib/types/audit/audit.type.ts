import type { ObjectId } from "mongodb";

/**
 * What was acted on. One entry per deletion; extend as more auditable actions
 * appear.
 *
 * Template deletions are logged in Postgres's `template_deletions` table,
 * where they join to `users`; this collection only records task deletions.
 */
export type AuditResource = "task";

export type AuditAction = "deleted";

export interface AuditActor {
  id: string | null;
  email: string | null;
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
