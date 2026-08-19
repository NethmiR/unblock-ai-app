import { apiRequest } from "./client";
import type { ApproverViewDto, DecisionResultDto } from "@/types/approval";
import type { StepOutcomeResult } from "@/types/task";

export const approvalsApi = {
  /** `404` for both a malformed AND an unrecognised token - deliberately does not confirm one ever existed. */
  getView: (token: string) => apiRequest<ApproverViewDto>(`/approvals/${encodeURIComponent(token)}`),

  /** `409` on a used/expired token or a step no longer awaiting approval - see approval page plan. */
  submitDecision: (token: string, outcome: StepOutcomeResult, reason: string | null = null) =>
    apiRequest<DecisionResultDto>(`/approvals/${encodeURIComponent(token)}/decision`, {
      method: "POST",
      body: { outcome, reason },
    }),
};
