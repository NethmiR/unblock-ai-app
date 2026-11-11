import type { Request } from "express";
import type { AuditActor } from "../../lib/types/audit/audit.type.js";

export function actorFromRequest(req: Request): AuditActor {
  const user = req.auth?.user;
  if (!user) return { id: null, email: null };
  return { id: user.id, email: user.email };
}
