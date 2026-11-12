import type { Request, Response } from "express";
import { requireAuthContext } from "../utils/http/auth-context.util.js";
import { requireUuid } from "../utils/http/request-validator.util.js";
import { parseReplaceUserAffiliationsBody } from "../utils/http/user-affiliation-request.util.js";
import { serializeUserAffiliations } from "../utils/http/user-affiliation-serializer.util.js";
import { serializeOrganisationalUnitMember } from "../utils/http/organisational-unit-serializer.util.js";
import type { UserAffiliationService } from "../services/user-affiliation.service.js";

export interface UserAffiliationControllerOptions {
  userAffiliationService: UserAffiliationService;
}

export class UserAffiliationController {
  private readonly userAffiliationService: UserAffiliationService;

  constructor({ userAffiliationService }: UserAffiliationControllerOptions) {
    this.userAffiliationService = userAffiliationService;
  }

  getForUser = async (req: Request, res: Response): Promise<void> => {
    const affiliations = await this.userAffiliationService.getForUser(requireUuid(req.params.userId, "userId"));
    res.status(200).json({ affiliations: serializeUserAffiliations(affiliations) });
  };

  replaceForUser = async (req: Request, res: Response): Promise<void> => {
    const affiliations = await this.userAffiliationService.replaceForUser(
      requireUuid(req.params.userId, "userId"),
      parseReplaceUserAffiliationsBody(req.body),
      requireAuthContext(req).user.id,
    );
    res.status(200).json({ affiliations: serializeUserAffiliations(affiliations) });
  };

  getForCurrentUser = async (req: Request, res: Response): Promise<void> => {
    const affiliations = await this.userAffiliationService.getForUser(requireAuthContext(req).user.id);
    res.status(200).json({ affiliations: serializeUserAffiliations(affiliations) });
  };

  listUnitMembers = async (req: Request, res: Response): Promise<void> => {
    const members = await this.userAffiliationService.listUnitMembers(requireUuid(req.params.unitId, "unitId"));
    res.status(200).json({ members: members.map(serializeOrganisationalUnitMember) });
  };
}
