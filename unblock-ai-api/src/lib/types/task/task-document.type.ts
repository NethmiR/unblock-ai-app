import type { ObjectId } from "mongodb";
import type { AssigneeResolutionNote, AssigneeSource } from "../../../data/constants/assignee.constant.js";
import type { OrganisationalUnitType } from "../../../data/constants/organisational-unit.constant.js";
import type { SelectionMessageRole } from "../../../data/constants/selection.constant.js";
import type {
  ApprovalChannel,
  ApprovalDecision,
  TaskAuditEvent,
  TaskCreationSource,
  TaskStatus,
  TaskStepKind,
  TaskStepOrigin,
  TaskStepOutcome,
  TaskStepStatus,
} from "../../../data/constants/task.constant.js";
import type { Condition } from "../workflow/condition.type.js";
import type { TaskFormRecord } from "./task-form.type.js";
import type { PersonValue, TaskFieldValue } from "./task-value.type.js";

export interface RequesterSnapshotUnit {
  id: string;
  code: string;
  name: string;
  unit_type: OrganisationalUnitType;
  parent_name: string | null;
  designation_titles: string[];
}

export interface RequesterSnapshot {
  user_id: string;
  full_name: string;
  email: string;
  units: RequesterSnapshotUnit[];
}

export interface TaskAssignee {
  source: AssigneeSource;
  user_id: string | null;
  full_name: string | null;
  email: string | null;
  designation_title: string | null;
  organisational_unit_name: string | null;
  field_id: string | null;
  note: AssigneeResolutionNote | null;
  candidates: PersonValue[];
}

export interface TaskStepDependency {
  step_id: string;
  required_outcome: TaskStepOutcome;
}

export interface TaskApprovalRecord {
  token_hash: string | null;
  token_expires_at: Date | null;
  notified_at: Date | null;
  decision: ApprovalDecision | null;
  comment: string | null;
  decided_at: Date | null;
  decided_via: ApprovalChannel | null;
  decided_by_user_id: string | null;
  allows_information_request: boolean;
  terminates_on_rejection: boolean;
}

export interface InformationRequestRecord {
  requested_by_step_id: string;
  question: string;
  response_field_id: string;
}

export interface TaskStepRecord {
  id: string;
  definition_step_id: string | null;
  kind: TaskStepKind;
  origin: TaskStepOrigin;
  name: string;
  description: string | null;
  instructions_to_approver: string | null;
  depends_on: TaskStepDependency[];
  condition: Condition | null;
  status: TaskStepStatus;
  outcome: TaskStepOutcome | null;
  form_id: string | null;
  assignee: TaskAssignee | null;
  approval: TaskApprovalRecord | null;
  information_request: InformationRequestRecord | null;
  activated_at: Date | null;
  completed_at: Date | null;
}

export interface TaskConversationMessage {
  role: SelectionMessageRole;
  text: string;
  sent_at: Date;
}

export interface TaskAuditEntry {
  event: TaskAuditEvent;
  step_id: string | null;
  detail: string | null;
  created_at: Date;
}

export interface UnsupportedTaskInput {
  input_id: string;
  label: string;
}

export interface TaskDocument {
  _id: ObjectId;
  reference: string;
  revision: number;
  created_by: string;
  requester: RequesterSnapshot;
  workflow_template_id: string;
  workflow_template_version: number;
  title: string;
  status: TaskStatus;
  creation_source: TaskCreationSource;
  conversation: TaskConversationMessage[];
  steps: TaskStepRecord[];
  forms: TaskFormRecord[];
  values: Record<string, TaskFieldValue>;
  unsupported_inputs: UnsupportedTaskInput[];
  audit: TaskAuditEntry[];
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}
