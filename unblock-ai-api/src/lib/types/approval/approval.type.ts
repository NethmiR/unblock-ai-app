import type { ResponseField } from "../workflow/step.type.js";
import type { StepOutcomeResult } from "../task/task.type.js";

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
  computed: Array<{ label: string; value: string }>;
  prior_decisions: Array<{ step: string; outcome: string; reason: string | null; at: Date }>;
  approvers: Array<{
    step_id: string;
    designation: string;
    name: string | null;
    email: string | null;
    status: ApproverStatus;
    is_current: boolean;
    decided_at: Date | null;
  }>;
  allowed_outcomes: StepOutcomeResult[];
  outcomes: Array<{ outcome: StepOutcomeResult; include_reason: boolean }>;
  already_decided: boolean;
  decided_outcome: StepOutcomeResult | null;
  decided_at: Date | null;
}

export interface DecisionInput {
  outcome: StepOutcomeResult;
  reason: string | null;
}

export interface DecisionResultDto {
  task_id: string;
  step_id: string;
  outcome: StepOutcomeResult;
  status: string;
  completed: boolean;
  terminated: boolean;
}

export interface TaskTimelineEntry {
  step: string;
  outcome: string | null;
  reason: string | null;
  at: Date;
}

export interface TaskStatusDto {
  status: string;
  reference: string;
  workflow_title: string;
  current_steps: string[];
  rejected_at_step: string | null;
  rejected_by: string | null;
  reason: string | null;
  timeline: TaskTimelineEntry[];
}
