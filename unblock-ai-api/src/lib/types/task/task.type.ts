import type { ObjectId } from "mongodb";
import type { PersonValue, RequirementValue, TaskRequirement } from "./requirement.type.js";
import type { StepDependency } from "../workflow/step.type.js";

export type TaskStatus =
  | "collecting"
  | "ready"
  | "in_progress"
  | "completed"
  | "rejected"
  | "cancelled";

export type StepRuntimeState =
  | "blocked"
  | "ready"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "skipped";

export type StepOutcomeResult = "approved" | "rejected" | "request_more_info";

export interface TaskStepState {
  step_id: string;
  name: string;
  type: string;
  depends_on: StepDependency[];
  state: StepRuntimeState;
  assignee: PersonValue | null;
  outcome: StepOutcomeResult | null;
  reason: string | null;
  responded_at: Date | null;
  approval_token: string | null;
}

export interface TaskAuditEntry {
  type: string;
  detail: string | null;
  created_at: Date;
}

export interface TaskDocument {
  _id: ObjectId;
  reference: string;
  session_id: string;
  workflow_id: string;
  version: number;
  status: TaskStatus;
  requirements: TaskRequirement[];
  values: Record<string, RequirementValue>;
  steps: TaskStepState[];
  audit: TaskAuditEntry[];
  created_at: Date;
  updated_at: Date;
}

export interface TaskDto {
  id: string;
  reference: string;
  session_id: string;
  workflow_id: string;
  version: number;
  status: TaskStatus;
  requirements: TaskRequirement[];
  values: Record<string, RequirementValue>;
  steps: TaskStepState[];
  audit: TaskAuditEntry[];
  created_at: Date;
  updated_at: Date;
}

export interface NextRequirementDto {
  requirement: TaskRequirement | null;
  complete: boolean;
}
