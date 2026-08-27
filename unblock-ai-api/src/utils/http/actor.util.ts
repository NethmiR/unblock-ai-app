import type { Request } from "express";
import type { AuditActor } from "../../lib/types/audit/audit.type.js";

/**
 * Derives the acting user for an audit entry from the authenticated session
 * (`req.user`, set by the `authenticate` middleware). Unauthenticated
 * requests - there are a few, like the approval-link routes - still resolve
 * to nulls rather than throwing.
 */
export function actorFromRequest(req: Request): AuditActor {
  const user = req.user;
  if (!user) return { id: null, email: null, role: null };
  return { id: user.id, email: user.email, role: user.audience };
}
