"use client";
import useSWR from "swr";
import { useHasPermission } from "@/components/providers/SessionProvider";
import { fetcher } from "@/lib/api/client";
import { APPROVER_APPROVAL_SUMMARY_PATH } from "@/lib/api/approvals";
import { APPROVAL_INBOX_POLL_INTERVAL_MS } from "@/lib/approvals/approval-constant";
import { Permission } from "@/types/permission";
import type { ApprovalAssignmentSummaryDto } from "@/types/approval";

export function usePendingApprovalCount(): number | null {
  const canApprove = useHasPermission(Permission.TASK_APPROVE);
  const { data } = useSWR<ApprovalAssignmentSummaryDto>(canApprove ? APPROVER_APPROVAL_SUMMARY_PATH : null, fetcher, {
    refreshInterval: APPROVAL_INBOX_POLL_INTERVAL_MS,
  });
  return canApprove && data !== undefined ? data.pending : null;
}
