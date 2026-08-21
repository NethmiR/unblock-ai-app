import type { Request } from "express";
import type { AuditActor } from "../../lib/types/audit/audit.type.js";

/**
 * Derives the acting user for an audit entry.
 *
 * There is no authentication yet, so this reads the `x-actor-*` headers the
 * frontend sends and falls back to nulls. It is a placeholder with a real
 * shape: when login ships, replace the body with a read of `req.user` and
 * every audit entry starts carrying a trustworthy identity without touching
 * any caller.
 *
 * These headers are NOT a security boundary - never authorise anything on them.
 */
export function actorFromRequest(req: Request): AuditActor {
  const header = (name: string): string | null => {
    const value = req.header(name);
    return value && value.trim().length > 0 ? value.trim() : null;
  };

  return {
    id: header("x-actor-id"),
    email: header("x-actor-email"),
    role: header("x-actor-role"),
  };
}
