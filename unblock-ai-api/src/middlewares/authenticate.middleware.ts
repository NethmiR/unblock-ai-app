import type { Request, Response } from "express";
import { asyncHandler } from "./async-handler.middleware.js";
import { readBearerToken } from "../utils/http/bearer-token.util.js";
import type { AuthenticationService } from "../services/authentication.service.js";

export interface AuthenticateMiddlewareOptions {
  authenticationService: AuthenticationService;
}

export function createAuthenticateMiddleware({ authenticationService }: AuthenticateMiddlewareOptions) {
  return asyncHandler(async (req: Request, _res: Response, next) => {
    const token = readBearerToken(req);
    if (token) {
      const context = await authenticationService.authenticate(token);
      if (context) req.auth = context;
    }
    next();
  });
}
