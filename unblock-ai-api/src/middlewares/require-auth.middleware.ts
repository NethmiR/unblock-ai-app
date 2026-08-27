import type { NextFunction, Request, RequestHandler, Response } from "express";
import { UnauthorizedError } from "../errors/unauthorized.error.js";
import { ForbiddenError } from "../errors/forbidden.error.js";
import type { AuthAudience } from "../lib/types/auth/auth.type.js";

/** Rejects unless `authenticate` populated `req.user`. */
export function requireAuth(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw new UnauthorizedError("Authentication required");
    next();
  };
}

/** Rejects unless the authenticated user belongs to the given audience. */
export function requireRole(audience: AuthAudience): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw new UnauthorizedError("Authentication required");
    if (req.user.audience !== audience) throw new ForbiddenError("Insufficient permissions");
    next();
  };
}
