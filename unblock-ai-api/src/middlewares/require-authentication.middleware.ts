import type { NextFunction, Request, RequestHandler, Response } from "express";
import { requireAuthContext } from "../utils/http/auth-context.util.js";

export function requireAuthentication(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    requireAuthContext(req);
    next();
  };
}
