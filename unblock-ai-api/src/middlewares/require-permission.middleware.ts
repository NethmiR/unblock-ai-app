import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ForbiddenError } from "../errors/forbidden.error.js";
import { AuthErrorCode } from "../data/constants/auth.constant.js";
import { hasAnyPermission } from "../utils/auth/permission.util.js";
import { requireAuthContext } from "../utils/http/auth-context.util.js";
import type { Permission } from "../data/constants/permission.constant.js";

export function requireAnyPermission(...permissions: Permission[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { user } = requireAuthContext(req);
    if (!hasAnyPermission(user.permissions, permissions)) {
      throw new ForbiddenError("Insufficient permissions", { code: AuthErrorCode.PERMISSION_DENIED });
    }
    next();
  };
}
