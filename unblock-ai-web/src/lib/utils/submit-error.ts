import { ApiError } from "@/lib/api/client";

/**
 * Classifies a failed decision submission per the approver-page plan (Phase 3.2):
 * 409 (token already used/expired/step no longer pending) is terminal - the decision
 * card must not stay live. 400 (missing reason) is a recoverable inline form error.
 * Anything else falls back to a generic inline message.
 */
export type SubmitErrorOutcome =
  | { kind: "terminal"; message: string }
  | { kind: "inline"; message: string };

export function classifySubmitError(err: unknown): SubmitErrorOutcome {
  if (err instanceof ApiError && err.status === 409) {
    return { kind: "terminal", message: err.message };
  }
  if (err instanceof ApiError) {
    return { kind: "inline", message: err.message };
  }
  return { kind: "inline", message: "Something went wrong submitting your decision. Please try again." };
}
