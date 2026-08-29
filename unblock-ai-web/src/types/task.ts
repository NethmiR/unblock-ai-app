/**
 * TypeScript mirror of unblock-ai-api/src/lib/types/task/{requirement,task}.type.ts.
 *
 * WHEN THE SCHEMA CHANGES, CHANGE THIS FILE IN THE SAME COMMIT.
 * There is no codegen step; this is a hand-maintained contract, and a drifted
 * contract produces `undefined` at runtime with no compile error.
 */
import type { InputType, InputValidation } from "./workflow";

export type RequirementSource = "input" | "actor";
export type RequirementStatus = "pending" | "filled" | "skipped";
export type RequirementType = InputType | "person";

export interface PersonValue {
  name: string;
  email: string;
}

export type RequirementValue = string | number | boolean | PersonValue | null;

export interface TaskRequirement {
  key: string;
  source: RequirementSource;
  ref: string;
  label: string;
  description: string | null;
  type: RequirementType;
  required: boolean;
  validation: InputValidation | null;
  collection_hint: string | null;
  status: RequirementStatus;
}

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
  type: string; // API types this `string`, not StepType — mirror it as-is
  depends_on: Array<{ step_id: string; required_outcome: string }>;
  state: StepRuntimeState;
  assignee: PersonValue | null;
  outcome: StepOutcomeResult | null;
  reason: string | null;
  responded_at: string | null; // Date on the API, ISO string on the wire
  approval_token: string | null;
  token_expires_at: string | null;
  token_used_at: string | null;
  notified_at: string | null;
  reopen_count: number;
}

export interface TaskAuditEntry {
  type: string;
  detail: string | null;
  created_at: string;
}

/** Metadata only - the bytes are fetched separately via `tasksApi.document`. */
export interface CompletionDocumentRecord {
  generated_at: string; // Date on the API, ISO string on the wire
  filename: string;
  byte_size: number;
  sha256: string;
  emailed_to: string | null;
  emailed_at: string | null; // Date on the API, ISO string on the wire
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
  completion_document: CompletionDocumentRecord | null;
  created_at: string;
  updated_at: string;
}

export interface NextRequirementDto {
  requirement: TaskRequirement | null;
  complete: boolean;
}
