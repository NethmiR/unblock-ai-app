import { apiRequest } from "./client";
import { withQuery } from "./query-string";
import type {
  ApprovalAssignmentListQuery,
  ApprovalDecisionInputDto,
  ApprovalDecisionResultDto,
  ApprovalHistoryListQuery,
  ApproverViewDto,
} from "@/types/approval";

export function approvalPath(token: string): string {
  return `/approvals/${encodeURIComponent(token)}`;
}

export const approvalsApi = {
  getView: (token: string) => apiRequest<ApproverViewDto>(approvalPath(token)),

  decide: (token: string, body: ApprovalDecisionInputDto) =>
    apiRequest<ApprovalDecisionResultDto>(`${approvalPath(token)}/decision`, { method: "POST", body }),
};

export const APPROVER_APPROVALS_PATH = "/approver/approvals";
export const APPROVER_APPROVAL_SUMMARY_PATH = `${APPROVER_APPROVALS_PATH}/summary`;

export function approverApprovalPendingPath(query: ApprovalAssignmentListQuery): string {
  return withQuery(`${APPROVER_APPROVALS_PATH}/pending`, query);
}

export function approverApprovalHistoryPath(query: ApprovalHistoryListQuery): string {
  return withQuery(`${APPROVER_APPROVALS_PATH}/history`, query);
}

export function approverApprovalPath(taskId: string, stepId: string): string {
  return `${APPROVER_APPROVALS_PATH}/${encodeURIComponent(taskId)}/steps/${encodeURIComponent(stepId)}`;
}

export const approverApprovalsApi = {
  decide: (taskId: string, stepId: string, body: ApprovalDecisionInputDto) =>
    apiRequest<ApprovalDecisionResultDto>(`${approverApprovalPath(taskId, stepId)}/decision`, { method: "POST", body }),
};
