export const DRAFT_STATUS = {
  PENDING: "pending",
  EXTRACTED: "extracted",
  FAILED: "failed",
  REJECTED: "rejected",
} as const;

export const REVIEW_STATUS = {
  PENDING: "pending_admin_review",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
} as const;

export const SELECTION_DECISION = {
  MATCHED: "matched",
  AMBIGUOUS: "ambiguous",
  NO_MATCH: "no_match",
  MANUAL_CHOICE: "manual_choice",
} as const;

export const SESSION_OUTCOME = {
  MATCHED: "matched",
  ABANDONED: "abandoned",
  NO_MATCH: "no_match",
} as const;

export const TASK_STATUS = {
  COLLECTING: "collecting",
  READY: "ready",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

export const REQUIREMENT_STATUS = {
  PENDING: "pending",
  FILLED: "filled",
  SKIPPED: "skipped",
} as const;

export const STEP_STATE = {
  BLOCKED: "blocked",
  READY: "ready",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  REJECTED: "rejected",
  SKIPPED: "skipped",
} as const;

export const STEP_OUTCOME = {
  APPROVED: "approved",
  REJECTED: "rejected",
  REQUEST_MORE_INFO: "request_more_info",
} as const;

export const OUTCOME_ACTION = {
  CONTINUE: "continue",
  TERMINATE_WORKFLOW: "terminate_workflow",
  REOPEN_INPUT: "reopen_input",
} as const;
