import type { Request, Response } from "express";
import { AuthService } from "../services/auth.service.js";
import { requireNonEmptyString, requireOneOf } from "../utils/http/request-validator.util.js";
import { UnauthorizedError } from "../errors/unauthorized.error.js";

const AUDIENCES = ["admin", "portal"] as const;

export interface AuthControllerOptions {
  authService: AuthService;
}

export class AuthController {
  private readonly authService: AuthService;

  constructor({ authService }: AuthControllerOptions) {
    this.authService = authService;
  }

  login = async (req: Request, res: Response): Promise<void> => {
    const audience = requireOneOf(req.body, "audience", AUDIENCES);
    const username = requireNonEmptyString(req.body, "username");
    const password = requireNonEmptyString(req.body, "password");

    const result = await this.authService.login(audience, username, password);
    res.status(200).json(result);
  };

  me = async (req: Request, res: Response): Promise<void> => {
    const user = await this.authService.getUserFromToken(bearerToken(req));
    if (!user) throw new UnauthorizedError("Invalid or expired session");
    res.status(200).json({ user });
  };

  // Stateless session (D-3): there is nothing server-side to invalidate.
  // The client simply discards the token/cookie.
  logout = async (_req: Request, res: Response): Promise<void> => {
    res.status(204).send();
  };
}

function bearerToken(req: Request): string {
  const header = req.header("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    throw new UnauthorizedError("Missing bearer token");
  }
  return header.slice(header.indexOf(" ") + 1).trim();
}
