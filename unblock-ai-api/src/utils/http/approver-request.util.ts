import type { Request } from "express";
import { APPROVAL_DECISIONS } from "../../data/constants/task.constant.js";
import { ApprovalAssignmentState } from "../../data/constants/approval.constant.js";
import { optionalNullableString, parseOptionalOneOfQuery, requireNonEmptyString, requireOneOf } from "./request-validator.util.js";
import { parseListWindow } from "./task-request.util.js";
import type { ApprovalAssignmentFilter, ApprovalDecisionInputDto } from "../../lib/types/approval/approval.type.js";

export interface ApprovalAssignmentParams {
  taskId: string;
  stepId: string;
}

export function parseApprovalAssignmentQuery(query: Request["query"], state: ApprovalAssignmentState): ApprovalAssignmentFilter {
  const decision = state === ApprovalAssignmentState.DECIDED ? parseOptionalOneOfQuery(query.decision, "decision", APPROVAL_DECISIONS) : null;
  return { state, decision, ...parseListWindow(query) };
}

export function approvalAssignmentParams(req: Request): ApprovalAssignmentParams {
  return { taskId: requireNonEmptyString(req.params, "taskId"), stepId: requireNonEmptyString(req.params, "stepId") };
}

export function parseDecisionInput(body: unknown): ApprovalDecisionInputDto {
  return { decision: requireOneOf(body, "decision", APPROVAL_DECISIONS), comment: optionalNullableString(body, "comment") ?? null };
}
