import type { Request, Response } from "express";
import { ApprovalService } from "../services/approval.service.js";
import { optionalString, requireOneOf } from "../utils/http/request-validator.util.js";

export interface ApprovalControllerOptions {
  approvalService: ApprovalService;
}

export class ApprovalController {
  private readonly approvalService: ApprovalService;

  constructor({ approvalService }: ApprovalControllerOptions) {
    this.approvalService = approvalService;
  }

  getApproverView = async (req: Request, res: Response): Promise<void> => {
    const view = await this.approvalService.getApproverView(req.params.token as string);
    res.json(view);
  };

  submitDecision = async (req: Request, res: Response): Promise<void> => {
    const outcome = requireOneOf(req.body, "outcome", ["approved", "rejected", "request_more_info"] as const);
    const reason = optionalString(req.body, "reason");
    const result = await this.approvalService.submitDecision(req.params.token as string, outcome, reason);
    res.json(result);
  };
}
