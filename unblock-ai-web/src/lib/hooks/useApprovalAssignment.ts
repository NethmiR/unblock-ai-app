"use client";
import useSWR, { type SWRResponse } from "swr";
import { fetcher } from "@/lib/api/client";
import { approverApprovalPath } from "@/lib/api/approvals";
import { hasErrorCode } from "@/lib/task-request/task-error-message";
import { ApprovalErrorCode, type ApproverViewDto } from "@/types/approval";

export function isApprovalUnavailable(error: unknown): boolean {
  return hasErrorCode(error, ApprovalErrorCode.APPROVAL_NOT_FOUND);
}

export function useApprovalAssignment(taskId: string, stepId: string): SWRResponse<ApproverViewDto, unknown> {
  return useSWR<ApproverViewDto>(approverApprovalPath(taskId, stepId), fetcher, {
    shouldRetryOnError: (error) => !isApprovalUnavailable(error),
  });
}
