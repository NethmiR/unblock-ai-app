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
