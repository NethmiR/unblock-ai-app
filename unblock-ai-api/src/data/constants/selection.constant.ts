export enum SelectionDecisionKind {
  MATCHED = "matched",
  AMBIGUOUS = "ambiguous",
  NO_MATCH = "no_match",
  MANUAL_CHOICE = "manual_choice",
  START_REQUESTED = "start_requested",
}

export const SELECTOR_DECISION_KINDS = [
  SelectionDecisionKind.MATCHED,
  SelectionDecisionKind.AMBIGUOUS,
  SelectionDecisionKind.NO_MATCH,
  SelectionDecisionKind.START_REQUESTED,
] as const;

export enum SelectionSessionStatus {
  OPEN = "open",
  MATCHED = "matched",
  NO_MATCH = "no_match",
}

export enum SelectionMessageRole {
  REQUESTER = "requester",
  ASSISTANT = "assistant",
}

export enum SelectionTraceStep {
  PROFILE_READ = "profile_read",
  CANDIDATES_RETRIEVED = "candidates_retrieved",
  CANDIDATES_REUSED = "candidates_reused",
  EXCLUDED_BY_AUDIENCE = "excluded_by_audience",
  EXCLUDED_BY_REQUESTER_TYPE = "excluded_by_requester_type",
  SELECTOR_CONSULTED = "selector_consulted",
  SELECTOR_NOT_NEEDED = "selector_not_needed",
  ROUND_LIMIT_REACHED = "round_limit_reached",
}

export const SELECTION_FIELD_LIMIT = { MESSAGE_MAX_LENGTH: 1000, MESSAGES_PER_SESSION_MAX: 20 } as const;
