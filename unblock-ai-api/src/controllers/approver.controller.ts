import type { Request, Response } from "express";
import { ApprovalAssignmentState } from "../data/constants/approval.constant.js";
import { requireAuthContext } from "../utils/http/auth-context.util.js";
import { approverIdentityOf } from "../utils/approval/approver-identity.util.js";
import { approvalAssignmentParams, parseApprovalAssignmentQuery, parseDecisionInput } from "../utils/http/approver-request.util.js";
import { serializeApprovalAssignmentList, serializeApproverView } from "../utils/http/approval-serializer.util.js";
import type { ApprovalService } from "../services/approval.service.js";
import type { ApproverAssignmentService } from "../services/approver-assignment.service.js";
import type { ApprovalAssignmentSummaryDto } from "../lib/types/approval/approval.type.js";
import type { ApproverIdentity } from "../lib/types/approval/approver-identity.type.js";

export interface ApproverControllerOptions {
  assignmentService: Pick<ApproverAssignmentService, "list" | "pendingCount">;
  approvalService: Pick<ApprovalService, "getViewForAssignee" | "decideAsAssignee">;
}

function identityOf(req: Request): ApproverIdentity {
  return approverIdentityOf(requireAuthContext(req).user);
}

export class ApproverController {
  private readonly assignmentService: ApproverControllerOptions["assignmentService"];
  private readonly approvalService: ApproverControllerOptions["approvalService"];

  constructor({ assignmentService, approvalService }: ApproverControllerOptions) {
    this.assignmentService = assignmentService;
    this.approvalService = approvalService;
  }

  listPending = async (req: Request, res: Response): Promise<void> => {
    await this.list(req, res, ApprovalAssignmentState.PENDING);
  };

  listHistory = async (req: Request, res: Response): Promise<void> => {
    await this.list(req, res, ApprovalAssignmentState.DECIDED);
  };

  summary = async (req: Request, res: Response): Promise<void> => {
    const body: ApprovalAssignmentSummaryDto = { pending: await this.assignmentService.pendingCount(identityOf(req)) };
    res.json(body);
  };

  getAssignment = async (req: Request, res: Response): Promise<void> => {
    const { taskId, stepId } = approvalAssignmentParams(req);
    res.json(serializeApproverView(await this.approvalService.getViewForAssignee(taskId, stepId, identityOf(req))));
  };

  decide = async (req: Request, res: Response): Promise<void> => {
    const { taskId, stepId } = approvalAssignmentParams(req);
    res.json(await this.approvalService.decideAsAssignee(taskId, stepId, identityOf(req), parseDecisionInput(req.body)));
  };

  private async list(req: Request, res: Response, state: ApprovalAssignmentState): Promise<void> {
    const filter = parseApprovalAssignmentQuery(req.query, state);
    const page = await this.assignmentService.list(identityOf(req), filter);
    res.json(serializeApprovalAssignmentList(page, filter.limit, filter.offset));
  }
}
