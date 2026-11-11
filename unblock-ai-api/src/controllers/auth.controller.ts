import type { Request, Response } from "express";
import { requireNonEmptyString } from "../utils/http/request-validator.util.js";
import { requireAuthContext } from "../utils/http/auth-context.util.js";
import { serializeCurrentUser, serializeLoginResult } from "../utils/http/auth-serializer.util.js";
import type { AuthenticationService } from "../services/authentication.service.js";

export interface AuthControllerOptions {
  authenticationService: AuthenticationService;
}

export class AuthController {
  private readonly authenticationService: AuthenticationService;

  constructor({ authenticationService }: AuthControllerOptions) {
    this.authenticationService = authenticationService;
  }

  login = async (req: Request, res: Response): Promise<void> => {
    const email = requireNonEmptyString(req.body, "email");
    const password = requireNonEmptyString(req.body, "password");

    const result = await this.authenticationService.login(
      { email, password },
      { userAgent: req.get("user-agent") ?? null },
    );
    res.status(200).json(serializeLoginResult(result));
  };

  me = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(serializeCurrentUser(requireAuthContext(req)));
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await this.authenticationService.logout(requireAuthContext(req));
    res.status(204).send();
  };
}
