import type { Request, Response } from "express";
import { asyncHandler } from "./async-handler.middleware.js";
import type { AuthService } from "../services/auth.service.js";

export interface AuthenticateMiddlewareOptions {
  authService: AuthService;
}

/**
 * Parses a bearer token and populates `req.user` when it is valid - it never
 * rejects the request. Routes that must gate access use requireAuth()/
 * requireRole() after this. Populate-only is deliberate: `/api/approvals/*`
 * is authenticated by a different mechanism (the approval token) and must
 * keep working for callers with no session at all.
 */
export function createAuthenticateMiddleware({ authService }: AuthenticateMiddlewareOptions) {
  return asyncHandler(async (req: Request, _res: Response, next) => {
    const token = bearerToken(req);
    if (token) {
      const user = await authService.getUserFromToken(token);
      if (user) req.user = user;
    }
    next();
  });
}

function bearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(header.indexOf(" ") + 1).trim();
  return token.length > 0 ? token : null;
}
