import { APPROVAL_LIST_PAGE_SIZE } from "./approval-constant";
import { ApprovalDecision } from "@/types/task";
import type { ApprovalAssignmentListQuery, ApprovalHistoryListQuery } from "@/types/approval";

const APPROVAL_DECISIONS: readonly ApprovalDecision[] = Object.values(ApprovalDecision);

export interface ApprovalListParams {
  search: string;
  offset: number;
}

export interface ApprovalHistoryParams extends ApprovalListParams {
  decision: ApprovalDecision | null;
}

export function parseDecisionParam(raw: string | null): ApprovalDecision | null {
  return APPROVAL_DECISIONS.find((decision) => decision === raw) ?? null;
}

export function offsetParam(offset: number): string | null {
  return offset === 0 ? null : String(offset);
}

function normalisedSearch(search: string): string | null {
  const trimmed = search.trim();
  return trimmed === "" ? null : trimmed;
}

export function pendingApprovalQuery({ search, offset }: ApprovalListParams): ApprovalAssignmentListQuery {
  return { search: normalisedSearch(search), limit: APPROVAL_LIST_PAGE_SIZE, offset };
}

export function approvalHistoryQuery({ search, offset, decision }: ApprovalHistoryParams): ApprovalHistoryListQuery {
  return { ...pendingApprovalQuery({ search, offset }), decision };
}

export function isApprovalListFiltered({ search, decision }: ApprovalListParams & { decision?: ApprovalDecision | null }): boolean {
  return normalisedSearch(search) !== null || (decision ?? null) !== null;
}
