import type { Request, Response } from "express";
import { APPROVAL_DECISIONS } from "../data/constants/task.constant.js";
import { optionalNullableString, requireOneOf } from "../utils/http/request-validator.util.js";
import { serializeApproverView } from "../utils/http/approval-serializer.util.js";
import type { ApprovalService } from "../services/approval.service.js";
import type { ApprovalDecisionInputDto } from "../lib/types/approval/approval.type.js";

export interface ApprovalControllerOptions {
  approvalService: Pick<ApprovalService, "getView" | "decide">;
}

function tokenOf(req: Request): string {
  return String(req.params.token);
}

function parseDecisionInput(body: unknown): ApprovalDecisionInputDto {
  return { decision: requireOneOf(body, "decision", APPROVAL_DECISIONS), comment: optionalNullableString(body, "comment") ?? null };
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
