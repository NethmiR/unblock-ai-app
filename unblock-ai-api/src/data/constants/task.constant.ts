import type { StepType } from "../../lib/types/workflow/step.type.js";

export enum TaskStatus {
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  REJECTED = "rejected",
  CANCELLED = "cancelled",
}

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = [TaskStatus.COMPLETED, TaskStatus.REJECTED, TaskStatus.CANCELLED];

export enum TaskStepKind {
  FORM = "form",
  APPROVAL = "approval",
  INFORMATION_REQUEST = "information_request",
  NOTIFICATION = "notification",
  AUTOMATED_ACTION = "automated_action",
}

export const TASK_STEP_KIND_BY_WORKFLOW_STEP_TYPE: Readonly<Record<StepType, TaskStepKind>> = {
  approval: TaskStepKind.APPROVAL,
  review: TaskStepKind.APPROVAL,
  data_collection: TaskStepKind.FORM,
  notification: TaskStepKind.NOTIFICATION,
  automated_action: TaskStepKind.AUTOMATED_ACTION,
};

export enum TaskStepOrigin {
  WORKFLOW = "workflow",
  ENTRY_FORM = "entry_form",
  INFORMATION_REQUEST = "information_request",
  APPROVAL_REPEAT = "approval_repeat",
}

export enum TaskStepStatus {
  UPCOMING = "upcoming",
  AWAITING_REQUESTER = "awaiting_requester",
  AWAITING_APPROVER = "awaiting_approver",
  COMPLETED = "completed",
  SKIPPED = "skipped",
  CANCELLED = "cancelled",
}

export const ACTIVE_TASK_STEP_STATUSES: readonly TaskStepStatus[] = [
  TaskStepStatus.AWAITING_REQUESTER,
  TaskStepStatus.AWAITING_APPROVER,
];

export enum TaskStepOutcome {
  COMPLETED = "completed",
  APPROVED = "approved",
  REJECTED = "rejected",
  REQUEST_MORE_INFO = "request_more_info",
  SKIPPED = "skipped",
}

export enum ApprovalDecision {
  APPROVED = "approved",
  REJECTED = "rejected",
  REQUEST_MORE_INFO = "request_more_info",
}

export const APPROVAL_DECISIONS: readonly ApprovalDecision[] = Object.values(ApprovalDecision);

export const COMMENT_REQUIRED_DECISIONS: readonly ApprovalDecision[] = [
  ApprovalDecision.REJECTED,
  ApprovalDecision.REQUEST_MORE_INFO,
];

export enum TaskCreationSource {
  SELECTION_SESSION = "selection_session",
  CATALOGUE = "catalogue",
}

export enum TaskAuditEvent {
  TASK_CREATED = "task_created",
  STEP_ACTIVATED = "step_activated",
  STEP_SKIPPED = "step_skipped",
  FORM_DRAFT_SAVED = "form_draft_saved",
  FORM_SUBMITTED = "form_submitted",
  APPROVAL_DISPATCHED = "approval_dispatched",
  DECISION_RECORDED = "decision_recorded",
  INFORMATION_REQUESTED = "information_requested",
  TASK_COMPLETED = "task_completed",
  TASK_REJECTED = "task_rejected",
  TASK_CANCELLED = "task_cancelled",
  TRANSCRIPT_EMAILED = "transcript_emailed",
}

export enum TaskEffectKind {
  DISPATCH_APPROVAL = "dispatch_approval",
  NOTIFY_REQUESTER_ACTION_REQUIRED = "notify_requester_action_required",
  NOTIFY_INFORMATION_REQUESTED = "notify_information_requested",
  SEND_STEP_NOTIFICATION = "send_step_notification",
  NOTIFY_TASK_REJECTED = "notify_task_rejected",
  NOTIFY_TASK_COMPLETED = "notify_task_completed",
  REVOKE_APPROVAL_LINKS = "revoke_approval_links",
}

export enum TaskValueNamespace {
  INPUTS = "inputs",
  REQUESTER = "requester",
  ASSIGNEES = "assignees",
  RESPONSES = "responses",
}

export const TASK_VALUE_NAMESPACES: readonly TaskValueNamespace[] = Object.values(TaskValueNamespace);

export const TASK_FIELD_LIMIT = {
  TEXT_MAX_LENGTH: 5000,
  COMMENT_MAX_LENGTH: 2000,
  SEARCH_MAX_LENGTH: 200,
  LIST_DEFAULT_LIMIT: 20,
  LIST_MAX_LIMIT: 100,
} as const;

export const ENTRY_FORM_STEP_ID = "entry_form";
export const INFORMATION_REQUEST_STEP_SUFFIX = "__information_request_";
export const APPROVAL_REPEAT_STEP_SUFFIX = "__repeat_";
export const FORM_ID_SUFFIX = "__form";
export const FIELD_ID_SEPARATOR = ".";

export const ENTRY_FORM_STEP_NAME = "Your request";
export const INFORMATION_REQUEST_STEP_NAME = "More information requested";

export const COMPLETING_STEP_OUTCOMES: readonly TaskStepOutcome[] = [
  TaskStepOutcome.APPROVED,
  TaskStepOutcome.COMPLETED,
  TaskStepOutcome.SKIPPED,
];

export const POSITIVE_STEP_OUTCOMES: readonly TaskStepOutcome[] = [TaskStepOutcome.APPROVED, TaskStepOutcome.COMPLETED];

export const TASK_STEP_OUTCOME_BY_DECISION: Readonly<Record<ApprovalDecision, TaskStepOutcome>> = {
  [ApprovalDecision.APPROVED]: TaskStepOutcome.APPROVED,
  [ApprovalDecision.REJECTED]: TaskStepOutcome.REJECTED,
  [ApprovalDecision.REQUEST_MORE_INFO]: TaskStepOutcome.REQUEST_MORE_INFO,
};

export const TERMINATING_OUTCOME_ACTION = "terminate_workflow";
