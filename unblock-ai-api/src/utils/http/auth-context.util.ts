import type { Request } from "express";
import { UnauthorizedError } from "../../errors/unauthorized.error.js";
import { AuthErrorCode } from "../../data/constants/auth.constant.js";
import type { AuthContext } from "../../lib/types/auth/auth.type.js";

export function requireAuthContext(req: Request): AuthContext {
  if (!req.auth) {
    throw new UnauthorizedError("Authentication required", { code: AuthErrorCode.AUTHENTICATION_REQUIRED });
  }
  return req.auth;
}
