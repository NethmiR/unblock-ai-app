/**
 * TypeScript mirror of unblock-ai-api/src/lib/types/approval/approval.type.ts.
 *
 * WHEN THE SCHEMA CHANGES, CHANGE THIS FILE IN THE SAME COMMIT.
 * There is no codegen step; this is a hand-maintained contract, and a drifted
 * contract produces `undefined` at runtime with no compile error.
 */
import type { ResponseField } from "./workflow";
import type { StepOutcomeResult } from "./task";

export type ApproverStatus =
  | "approved"
  | "rejected"
  | "request_more_info"
  | "awaiting"
  | "not_yet_reached";

export interface ApproverViewDto {
  task_reference: string;
  workflow_title: string;
  step: {
    step_id: string;
    name: string;
    instructions_to_approver: string | null;
    response_fields: ResponseField[];
  };
  approver: { name: string; email: string } | null;
  requester_answers: Array<{ label: string; value: string }>;
  computed: Array<{ label: string; value: string }>; // always [] today — see phase plan §0 Finding 3
  prior_decisions: Array<{ step: string; outcome: string; reason: string | null; at: string }>;
  approvers: Array<{
    step_id: string;
    designation: string;
    name: string | null;
    email: string | null;
    status: ApproverStatus;
    is_current: boolean;
    decided_at: string | null;
  }>;
  allowed_outcomes: StepOutcomeResult[];
  outcomes: Array<{ outcome: StepOutcomeResult; include_reason: boolean }>;
  already_decided: boolean;
  decided_outcome: StepOutcomeResult | null;
  decided_at: string | null;
}

export interface DecisionResultDto {
  task_id: string;
  step_id: string;
  outcome: StepOutcomeResult;
  status: string; // API types this `string`, not TaskStatus — mirror as-is
  completed: boolean;
  terminated: boolean;
}

export interface TaskTimelineEntry {
  step: string;
  outcome: string | null;
  reason: string | null;
  at: string;
}

export interface TaskStatusDto {
  status: string; // likewise `string` on the API
  reference: string;
  workflow_title: string;
  current_steps: string[];
  rejected_at_step: string | null;
  rejected_by: string | null;
  reason: string | null;
  timeline: TaskTimelineEntry[];
}
