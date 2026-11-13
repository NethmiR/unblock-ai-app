"use client";
import { usePendingApprovalCount } from "./usePendingApprovalCount";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { NavBadgeKey } from "@/types/navigation";

export interface NavBadge {
  count: number;
  label: string;
}

export type NavBadgeCounts = Record<NavBadgeKey, NavBadge | null>;

function navBadge(count: number | null, label: (count: number) => string): NavBadge | null {
  return count !== null && count > 0 ? { count, label: label(count) } : null;
}

export function useNavBadgeCounts(): NavBadgeCounts {
  const pendingApprovals = usePendingApprovalCount();
  return {
    [NavBadgeKey.PENDING_APPROVALS]: navBadge(pendingApprovals, TASK_REQUEST_COPY.approvals.pendingCountLabel),
  };
}
