import type { Request, Response } from "express";
import { parseDecisionInput } from "../utils/http/approver-request.util.js";
import { serializeApproverView } from "../utils/http/approval-serializer.util.js";
import type { ApprovalService } from "../services/approval.service.js";

export interface ApprovalControllerOptions {
  approvalService: Pick<ApprovalService, "getView" | "decide">;
}

function tokenOf(req: Request): string {
  return String(req.params.token);
}

export class ApprovalController {
  private readonly approvalService: ApprovalControllerOptions["approvalService"];

  constructor({ approvalService }: ApprovalControllerOptions) {
    this.approvalService = approvalService;
  }

  getApproverView = async (req: Request, res: Response): Promise<void> => {
    res.json(serializeApproverView(await this.approvalService.getView(tokenOf(req))));
  };

  submitDecision = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.approvalService.decide(tokenOf(req), parseDecisionInput(req.body)));
  };
}
