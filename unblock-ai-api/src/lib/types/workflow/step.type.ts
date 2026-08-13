import type { Actor } from "./actor.type.js";
import type { Condition } from "./condition.type.js";

export type StepType = "approval" | "notification" | "data_collection" | "automated_action" | "review";

export type StepInitialState = "auto" | "blocked";

export type StepOutcomeAction = "continue" | "terminate_workflow" | "reopen_input";

export type NotificationChannel = "email" | "sms" | "in_app";

export interface StepOutcome {
  action: StepOutcomeAction;
  notify: Actor[];
  include_reason: boolean | null;
  return_to_step: string | null;
  prompt_source: string | null;
}

export interface StepOutcomes {
  approved: StepOutcome | null;
  rejected: StepOutcome | null;
  request_more_info: StepOutcome | null;
}

export interface ResponseField {
  id: string;
  label: string;
  type: string;
  required_on_outcome: string[];
}

export interface StepDependency {
  step_id: string;
  required_outcome: string;
}

export interface ContextBinding {
  step_id: string;
  field: string;
  as: string;
}

export interface NotificationSetting {
  channel: NotificationChannel;
  template: string;
}

export interface StepNotifications {
  on_assign: NotificationSetting | null;
  on_outcome: NotificationSetting | null;
}

export interface StepSla {
  reminder_after_hours: number | null;
  escalate_after_hours: number | null;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: StepType;
  description: string | null;
  assignee: Actor;
  depends_on: StepDependency[];
  initial_state: StepInitialState;
  blocked_reason: string | null;
  condition: Condition | null;
  instructions_to_approver: string | null;
  response_fields: ResponseField[];
  context_from_steps: ContextBinding[];
  outcomes: StepOutcomes;
  notifications: StepNotifications;
  sla: StepSla | null;
}
