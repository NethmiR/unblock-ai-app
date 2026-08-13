import type { Actor } from "./actor.type.js";
import type { RetrievalSummary } from "./retrieval-summary.type.js";
import type { WorkflowStep } from "./step.type.js";

export type InstitutionType = "university" | "school" | "company" | "hospital" | "government" | "other";

export type ActorType = "student" | "staff" | "faculty" | "external" | "any";

export type ConstraintOperator = "equals" | "not_equals" | "in" | "not_in";

export type ConstraintValue = string | number | boolean | Array<string | number>;

export interface WorkflowConstraint {
  attribute: string;
  operator: ConstraintOperator;
  value: ConstraintValue;
}

export interface WorkflowScopeAppliesTo {
  actor_type: ActorType;
  constraints: WorkflowConstraint[];
}

export interface WorkflowScope {
  institution_type: InstitutionType;
  applies_to: WorkflowScopeAppliesTo;
}

export interface WorkflowRequester {
  actor_type: ActorType;
  identifier_field: string;
}

export type InputType =
  | "string"
  | "text"
  | "number"
  | "date"
  | "datetime"
  | "boolean"
  | "email"
  | "phone"
  | "enum"
  | "file"
  | "person";

export interface InputValidation {
  min_length: number | null;
  max_length: number | null;
  min: number | null;
  max: number | null;
  not_before: string | null;
  not_after: string | null;
  not_before_field: string | null;
  not_after_field: string | null;
  pattern: string | null;
}

export interface WorkflowInput {
  id: string;
  label: string;
  description: string | null;
  type: InputType;
  collected_from: Actor;
  required: boolean;
  validation: InputValidation;
  collection_hint: string | null;
}

export type ComputedOperation =
  | "date_diff_days"
  | "sum"
  | "difference"
  | "multiply"
  | "count"
  | "lookup"
  | "constant";

export interface WorkflowComputedArguments {
  from: string | null;
  to: string | null;
  inclusive: boolean | null;
  values: Array<string | number>;
  source: string | null;
  key: string | null;
  value: string | number | boolean | null;
}

export interface WorkflowComputed {
  id: string;
  description: string | null;
  operation: ComputedOperation;
  arguments: WorkflowComputedArguments;
}

export type CompletionActionType = "issue_reference_number" | "notify" | "instruction_to_requester";

export type NotificationChannelOrNull = "email" | "sms" | "in_app" | null;

export interface CompletionAction {
  type: CompletionActionType;
  format: string | null;
  store_as: string | null;
  target: Actor | null;
  template: string | null;
  channel: NotificationChannelOrNull;
  message: string | null;
}

export type CompletionRule = "all_required_steps_complete" | "any_step_complete" | "specific_steps";

export interface WorkflowCompletion {
  rule: CompletionRule;
  required_steps: string[];
  actions: CompletionAction[];
}

export type Confidence = "high" | "medium" | "low";

export type ReviewStatus = "pending_admin_review" | "confirmed" | "rejected";

export interface WorkflowMetadata {
  created_from: "plain_text";
  source_text_hash: string;
  extraction_model: string;
  extraction_timestamp: string;
  confidence: Confidence;
  ambiguities: string[];
  unmapped_roles: string[];
  review_status: ReviewStatus;
}

export interface WorkflowDefinition {
  schema_version: string;
  workflow_id: string;
  title: string;
  description: string;
  retrieval_summary: RetrievalSummary;
  scope: WorkflowScope;
  requester: WorkflowRequester;
  inputs: WorkflowInput[];
  computed: WorkflowComputed[];
  steps: WorkflowStep[];
  completion: WorkflowCompletion;
  metadata: WorkflowMetadata;
}
