import { apiRequest } from "./client";
import type { ApprovalDecisionInputDto, ApprovalDecisionResultDto, ApproverViewDto } from "@/types/approval";

export function approvalPath(token: string): string {
  return `/approvals/${encodeURIComponent(token)}`;
}

export const approvalsApi = {
  getView: (token: string) => apiRequest<ApproverViewDto>(approvalPath(token)),

  decide: (token: string, body: ApprovalDecisionInputDto) =>
    apiRequest<ApprovalDecisionResultDto>(`${approvalPath(token)}/decision`, { method: "POST", body }),
};
