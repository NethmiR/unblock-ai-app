import { TASK_REQUEST_COPY } from "./task-request-copy";
import { IconName } from "@/types/icon";
import { ApprovalDecision, TaskStatus, TaskStepKind, TaskStepStatus } from "@/types/task";

export type PresentationTone = "neutral" | "accent" | "warn" | "success" | "danger";

const STATUS = TASK_REQUEST_COPY.status;

export const TASK_STATUS_PRESENTATION: Record<TaskStatus, { label: string; tone: PresentationTone }> = {
  [TaskStatus.IN_PROGRESS]: { label: STATUS.task.in_progress, tone: "accent" },
  [TaskStatus.COMPLETED]: { label: STATUS.task.completed, tone: "success" },
  [TaskStatus.REJECTED]: { label: STATUS.task.rejected, tone: "danger" },
  [TaskStatus.CANCELLED]: { label: STATUS.task.cancelled, tone: "neutral" },
};

export const TASK_STEP_STATUS_PRESENTATION: Record<TaskStepStatus, { label: string; tone: PresentationTone; icon: IconName }> = {
  [TaskStepStatus.UPCOMING]: { label: STATUS.step.upcoming, tone: "neutral", icon: IconName.CLOCK },
  [TaskStepStatus.AWAITING_REQUESTER]: { label: STATUS.step.awaiting_requester, tone: "accent", icon: IconName.EDIT },
  [TaskStepStatus.AWAITING_APPROVER]: { label: STATUS.step.awaiting_approver, tone: "warn", icon: IconName.CLOCK },
  [TaskStepStatus.COMPLETED]: { label: STATUS.step.completed, tone: "success", icon: IconName.CHECK_CIRCLE },
  [TaskStepStatus.SKIPPED]: { label: STATUS.step.skipped, tone: "neutral", icon: IconName.ARROW_UP_RIGHT },
  [TaskStepStatus.CANCELLED]: { label: STATUS.step.cancelled, tone: "neutral", icon: IconName.CROSS_CIRCLE },
};

export const APPROVAL_DECISION_PRESENTATION: Record<
  ApprovalDecision,
  { label: string; actionLabel: string; tone: PresentationTone; icon: IconName }
> = {
  [ApprovalDecision.APPROVED]: {
    label: STATUS.decision.approved.label,
    actionLabel: STATUS.decision.approved.action,
    tone: "success",
    icon: IconName.CHECK_CIRCLE,
  },
  [ApprovalDecision.REJECTED]: {
    label: STATUS.decision.rejected.label,
    actionLabel: STATUS.decision.rejected.action,
    tone: "danger",
    icon: IconName.CROSS_CIRCLE,
  },
  [ApprovalDecision.REQUEST_MORE_INFO]: {
    label: STATUS.decision.request_more_info.label,
    actionLabel: STATUS.decision.request_more_info.action,
    tone: "warn",
    icon: IconName.QUESTION,
  },
};

export const TASK_STEP_KIND_PRESENTATION: Record<TaskStepKind, { label: string; icon: IconName }> = {
  [TaskStepKind.FORM]: { label: STATUS.kind.form, icon: IconName.EDIT },
  [TaskStepKind.APPROVAL]: { label: STATUS.kind.approval, icon: IconName.APPROVALS },
  [TaskStepKind.INFORMATION_REQUEST]: { label: STATUS.kind.information_request, icon: IconName.QUESTION },
  [TaskStepKind.NOTIFICATION]: { label: STATUS.kind.notification, icon: IconName.INBOX },
  [TaskStepKind.AUTOMATED_ACTION]: { label: STATUS.kind.automated_action, icon: IconName.SPARKLE },
};
