/**
 * TypeScript mirror of unblock-ai-api/src/data/schemas/workflow.schema.json.
 *
 * WHEN THE SCHEMA CHANGES, CHANGE THIS FILE IN THE SAME COMMIT.
 * There is no codegen step; this is a hand-maintained contract, and a drifted
 * contract produces `undefined` at runtime with no compile error.
 */

export type ActorResolution = "dynamic" | "static" | "requester" | "system";

export interface Actor {
  resolution: ActorResolution;
  role: string | null;
  relative_to: string | null;
  directory_query: string | null;
  fallback_role: string | null;
  display_name: string | null;
}

export type StepType =
  | "approval"
  | "notification"
  | "data_collection"
  | "automated_action"
  | "review";

export interface Dependency {
  step_id: string;
  required_outcome: string;
}

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "greater_or_equal"
  | "less_or_equal"
  | "in"
  | "not_in"
  | "exists"
  | "and"
  | "or"
  | "not";

export interface Condition {
  operator: ConditionOperator;
  left: string | number | boolean | null;
  right: string | number | boolean | null;
  clauses: Condition[];
  description: string | null;
}

export interface OutcomeEffect {
  action: "continue" | "terminate_workflow" | "reopen_input";
  notify: Actor[];
  include_reason: boolean | null;
  return_to_step: string | null;
  prompt_source: string | null;
}

export type NotificationChannel = "email" | "sms" | "in_app";

export interface ResponseField {
  id: string;
  label: string;
  type: string;
  required_on_outcome: string[];
}

export interface ContextBinding {
  step_id: string;
  field: string;
  as: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: StepType;
  description: string | null;
  assignee: Actor;
  depends_on: Dependency[];
  initial_state: "auto" | "blocked";
  blocked_reason: string | null;
  condition: Condition | null;
  instructions_to_approver: string | null;
  response_fields: ResponseField[];
  context_from_steps: ContextBinding[];
  outcomes: {
    approved: OutcomeEffect | null;
    rejected: OutcomeEffect | null;
    request_more_info: OutcomeEffect | null;
  };
  notifications: {
    on_assign: { channel: NotificationChannel; template: string } | null;
    on_outcome: { channel: NotificationChannel; template: string } | null;
  };
  sla: { reminder_after_hours: number | null; escalate_after_hours: number | null } | null;
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

/** Added in backend Phase 2. Drives all retrieval. */
export interface RetrievalSummary {
  one_liner: string;
  aliases: string[];
  keywords: string[];
  requester_types: string[];
  triggers: string[];
  not_for: string[];
}

export type ReviewStatus = "pending_admin_review" | "confirmed" | "rejected";

export type InstitutionType = "university" | "school" | "company" | "hospital" | "government" | "other";

export type ActorType = "student" | "staff" | "faculty" | "external" | "any";

export type ConstraintOperator = "equals" | "not_equals" | "in" | "not_in";

export type ConstraintValue = string | number | boolean | Array<string | number>;

export interface WorkflowConstraint {
  attribute: string;
  operator: ConstraintOperator;
  value: ConstraintValue;
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

export type CompletionRule = "all_required_steps_complete" | "any_step_complete" | "specific_steps";

export type CompletionActionType = "issue_reference_number" | "notify" | "instruction_to_requester";

export interface CompletionAction {
  type: CompletionActionType;
  format: string | null;
  store_as: string | null;
  target: Actor | null;
  template: string | null;
  channel: NotificationChannel | null;
  message: string | null;
}

export interface Workflow {
  schema_version: string;
  workflow_id: string;
  title: string;
  description: string;
  retrieval_summary: RetrievalSummary;
  scope: {
    institution_type: InstitutionType;
    applies_to: { actor_type: ActorType; constraints: WorkflowConstraint[] };
  };
  requester: { actor_type: ActorType; identifier_field: string };
  inputs: WorkflowInput[];
  computed: Array<{
    id: string;
    description: string | null;
    operation: ComputedOperation;
    arguments: WorkflowComputedArguments;
  }>;
  steps: WorkflowStep[];
  completion: { rule: CompletionRule; required_steps: string[]; actions: CompletionAction[] };
  metadata: {
    created_from: "plain_text";
    source_text_hash: string;
    extraction_model: string;
    extraction_timestamp: string;
    confidence: "high" | "medium" | "low";
    ambiguities: string[];
    unmapped_roles: string[];
    review_status: ReviewStatus;
  };
}

/** The list-endpoint projection - deliberately NOT the full document. */
export interface WorkflowSummary {
  workflow_id: string;
  title: string;
  description: string;
  version: number;
  schema_version: string;
  review_status: ReviewStatus;
  draft_id: string | null;
  updated_at: string;
}

/** The full stored row from GET /workflows/:id/record - includes draft_id. */
export interface WorkflowRecord {
  workflow_id: string;
  version: number;
  draft_id: string | null;
  review_status: ReviewStatus;
  document: Workflow;
  updated_at: string;
  /** The originating draft's prose, inlined by the API. `null` if unavailable. */
  draft_text?: string | null;
}

/**
 * A row from GET /workflows/deletions (Postgres `template_deletions`, D-2).
 * `versions_removed` reads 0 when the log landed but the Mongo delete did not
 * confirm - see the ordering comment on `WorkflowService.delete` in the API.
 */
export interface TemplateDeletion {
  id: string;
  workflow_id: string;
  template_title: string;
  latest_version: number;
  versions_removed: number;
  institution_type: string | null;
  review_status: string | null;
  deleted_by_admin_id: string;
  deleted_by_username: string;
  reason: string | null;
  request_id: string | null;
  snapshot: Record<string, unknown>;
  deleted_at: string;
}
