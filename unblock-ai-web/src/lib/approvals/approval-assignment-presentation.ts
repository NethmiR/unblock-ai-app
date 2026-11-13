import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { APPROVAL_DECISION_PRESENTATION } from "@/lib/task-request/task-status-presentation";
import { relativeTime } from "@/lib/utils/format";
import { ApprovalChannel, type ApprovalAssignmentDto } from "@/types/approval";
import { INFORMATION_REQUEST_STEP_NAME, TaskStatus } from "@/types/task";

const OUTCOME = TASK_REQUEST_COPY.approvals.outcome;

export const APPROVAL_CHANNEL_LABELS: Record<ApprovalChannel, string> = {
  [ApprovalChannel.EMAIL_LINK]: TASK_REQUEST_COPY.approver.decidedVia.email_link,
  [ApprovalChannel.APP]: TASK_REQUEST_COPY.approver.decidedVia.app,
};

export interface WaitingSince {
  iso: string;
  relative: string;
}

export function waitingSince(row: Pick<ApprovalAssignmentDto, "activated_at" | "submitted_at">, now: Date = new Date()): WaitingSince {
  const iso = row.activated_at ?? row.submitted_at;
  return { iso, relative: relativeTime(iso, now) };
}

function inProgressOutcome(row: Pick<ApprovalAssignmentDto, "decision" | "current_step_name">): string {
  if (row.current_step_name === null) return OUTCOME.inProgress;
  if (row.current_step_name === INFORMATION_REQUEST_STEP_NAME) return OUTCOME.awaitingRequester;
  if (row.decision === null) return row.current_step_name;
  return OUTCOME.movedOn(APPROVAL_DECISION_PRESENTATION[row.decision].label, row.current_step_name);
}

export function historyOutcomeText(row: Pick<ApprovalAssignmentDto, "task_status" | "decision" | "current_step_name">): string {
  switch (row.task_status) {
    case TaskStatus.IN_PROGRESS:
      return inProgressOutcome(row);
    case TaskStatus.COMPLETED:
      return OUTCOME.completed;
    case TaskStatus.REJECTED:
      return OUTCOME.rejected;
    case TaskStatus.CANCELLED:
      return OUTCOME.cancelled;
    default: {
      const unreachable: never = row.task_status;
      return unreachable;
    }
  }
}

export function decidedViaCaption(channel: ApprovalChannel | null): string | null {
  return channel === ApprovalChannel.EMAIL_LINK ? APPROVAL_CHANNEL_LABELS[channel] : null;
}
