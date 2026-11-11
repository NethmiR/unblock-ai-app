import type { Request, Response } from "express";
import { requireAuthContext } from "../utils/http/auth-context.util.js";
import { requireUuid } from "../utils/http/request-validator.util.js";
import { UserSessionRevocationReason } from "../data/constants/user-session.constant.js";
import type { UserSessionService } from "../services/user-session.service.js";

export interface UserSessionControllerOptions {
  userSessionService: UserSessionService;
}

export class UserSessionController {
  private readonly userSessionService: UserSessionService;

  constructor({ userSessionService }: UserSessionControllerOptions) {
    this.userSessionService = userSessionService;
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const { user, session } = requireAuthContext(req);
    const sessions = await this.userSessionService.listActive(user.id, session.id);
    res.status(200).json({ sessions });
  };

  revoke = async (req: Request, res: Response): Promise<void> => {
    const { user } = requireAuthContext(req);
    const sessionId = requireUuid(req.params.sessionId, "sessionId");
    await this.userSessionService.revoke(user.id, sessionId, UserSessionRevocationReason.REVOKED_BY_USER);
    res.status(204).send();
  };

  revokeOthers = async (req: Request, res: Response): Promise<void> => {
    const { user, session } = requireAuthContext(req);
    const revokedCount = await this.userSessionService.revokeOthers(user.id, session.id);
    res.status(200).json({ revoked_count: revokedCount });
  };
}
