import type { AssigneeResolutionNote, AssigneeSource } from "../../../data/constants/assignee.constant.js";
import type { OrganisationalUnitType } from "../../../data/constants/organisational-unit.constant.js";
import type { SelectionMessageRole } from "../../../data/constants/selection.constant.js";
import type {
  FormFieldControl,
  FormFieldIssueCode,
  FormFieldValueSource,
  FormFieldWidth,
  FormSectionKind,
  TaskFormStatus,
} from "../../../data/constants/task-form.constant.js";
import type {
  ApprovalDecision,
  TaskCreationSource,
  TaskStatus,
  TaskStepKind,
  TaskStepOrigin,
  TaskStepOutcome,
  TaskStepStatus,
} from "../../../data/constants/task.constant.js";
import type { InputValidation, WorkflowDefinition } from "../workflow/workflow.type.js";
import type { UnsupportedTaskInput } from "./task-document.type.js";
import type { FormFieldOption } from "./task-form.type.js";

export interface RequesterSnapshotDto {
  full_name: string;
  email: string;
  units: Array<{ code: string; name: string; unit_type: OrganisationalUnitType; parent_name: string | null; designation_titles: string[] }>;
}

export interface PersonValueDto {
  user_id: string | null;
  name: string;
  email: string;
}

export type TaskFieldValueDto = string | number | boolean | PersonValueDto | null;

export interface TaskFormFieldDto {
  id: string;
  label: string;
  description: string | null;
  control: FormFieldControl;
  width: FormFieldWidth;
  required: boolean;
  locked: boolean;
  value_source: FormFieldValueSource;
  validation: InputValidation | null;
  options: FormFieldOption[];
  value: TaskFieldValueDto;
}

export interface TaskFormSectionDto {
  id: string;
  kind: FormSectionKind;
  title: string;
  fields: TaskFormFieldDto[];
}

export interface TaskFormDto {
  id: string;
  step_id: string;
  title: string;
  status: TaskFormStatus;
  sections: TaskFormSectionDto[];
  saved_at: string | null;
  submitted_at: string | null;
  editable: boolean;
  submittable: boolean;
}

export interface TaskAssigneeDto {
  source: AssigneeSource;
  full_name: string | null;
  email: string | null;
  designation_title: string | null;
  organisational_unit_name: string | null;
  note: AssigneeResolutionNote | null;
}

export interface TaskApprovalDto {
  decision: ApprovalDecision | null;
  comment: string | null;
  decided_at: string | null;
  notified_at: string | null;
}

export interface TaskInformationRequestDto {
  requested_by_step_id: string;
  question: string;
}

export interface TaskStepDto {
  id: string;
  position: number;
  kind: TaskStepKind;
  origin: TaskStepOrigin;
  name: string;
  description: string | null;
  status: TaskStepStatus;
  outcome: TaskStepOutcome | null;
  is_conditional: boolean;
  form_id: string | null;
  assignee: TaskAssigneeDto | null;
  approval: TaskApprovalDto | null;
  information_request: TaskInformationRequestDto | null;
  activated_at: string | null;
  completed_at: string | null;
}

export interface TaskProgressDto {
  completed: number;
  total: number;
  current_step_ids: string[];
}

export interface TaskAvailableActionsDto {
  can_cancel: boolean;
  can_delete: boolean;
  can_download_transcript: boolean;
}

export interface TaskConversationMessageDto {
  role: SelectionMessageRole;
  text: string;
  sent_at: string;
}

export interface TaskDto {
  id: string;
  reference: string;
  title: string;
  status: TaskStatus;
  creation_source: TaskCreationSource;
  workflow_template_id: string;
  workflow_template_version: number;
  requester: RequesterSnapshotDto;
  conversation: TaskConversationMessageDto[];
  steps: TaskStepDto[];
  forms: TaskFormDto[];
  unsupported_inputs: UnsupportedTaskInput[];
  progress: TaskProgressDto;
  available_actions: TaskAvailableActionsDto;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TaskSummaryDto {
  id: string;
  reference: string;
  title: string;
  status: TaskStatus;
  current_steps: Array<{ id: string; name: string; status: TaskStepStatus }>;
  progress: TaskProgressDto;
  created_at: string;
  updated_at: string;
}

export interface TaskListResponseDto {
  tasks: TaskSummaryDto[];
  page: { total: number; limit: number; offset: number };
}

export interface FormFieldIssueDto {
  field_id: string;
  code: FormFieldIssueCode;
  limit: string | number | null;
}

export interface TaskWorkflowDefinitionDto {
  definition: WorkflowDefinition;
}

export type CreateTaskInput =
  | { source: TaskCreationSource.SELECTION_SESSION; selectionSessionId: string }
  | { source: TaskCreationSource.CATALOGUE; workflowTemplateId: string };

export interface TaskListFilter {
  status: TaskStatus | null;
  search: string | null;
  limit: number;
  offset: number;
}

export interface TaskListPage<T> {
  tasks: T[];
  total: number;
}
