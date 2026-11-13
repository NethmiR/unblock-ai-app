/**
 * TypeScript mirror of unblock-ai-api/src/lib/types/task/task-dto.type.ts and the enums in
 * unblock-ai-api/src/data/constants/{task,assignee,task-error}.constant.ts.
 *
 * WHEN THE SCHEMA CHANGES, CHANGE THIS FILE IN THE SAME COMMIT.
 */
import type { RequesterSnapshotDto } from "./requester";
import type { SelectionMessageRole } from "./selection";
import type { TaskFormDto } from "./task-form";
import type { Workflow } from "./workflow";

export enum TaskStatus {
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  REJECTED = "rejected",
  CANCELLED = "cancelled",
}

export const TASK_STATUSES: readonly TaskStatus[] = Object.values(TaskStatus);
export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = [TaskStatus.COMPLETED, TaskStatus.REJECTED, TaskStatus.CANCELLED];

export enum TaskStepKind {
  FORM = "form",
  APPROVAL = "approval",
  INFORMATION_REQUEST = "information_request",
  NOTIFICATION = "notification",
  AUTOMATED_ACTION = "automated_action",
}

export enum TaskStepOrigin {
  WORKFLOW = "workflow",
  ENTRY_FORM = "entry_form",
  INFORMATION_REQUEST = "information_request",
  APPROVAL_REPEAT = "approval_repeat",
}

export enum TaskStepStatus {
  UPCOMING = "upcoming",
  AWAITING_REQUESTER = "awaiting_requester",
  AWAITING_APPROVER = "awaiting_approver",
  COMPLETED = "completed",
  SKIPPED = "skipped",
  CANCELLED = "cancelled",
}

export const ACTIVE_TASK_STEP_STATUSES: readonly TaskStepStatus[] = [TaskStepStatus.AWAITING_REQUESTER, TaskStepStatus.AWAITING_APPROVER];

export enum TaskStepOutcome {
  COMPLETED = "completed",
  APPROVED = "approved",
  REJECTED = "rejected",
  REQUEST_MORE_INFO = "request_more_info",
  SKIPPED = "skipped",
}

export enum ApprovalDecision {
  APPROVED = "approved",
  REJECTED = "rejected",
  REQUEST_MORE_INFO = "request_more_info",
}

export enum TaskCreationSource {
  SELECTION_SESSION = "selection_session",
  CATALOGUE = "catalogue",
}

export enum AssigneeSource {
  DIRECTORY = "directory",
  REQUESTER_CHOICE = "requester_choice",
  REQUESTER_SUPPLIED = "requester_supplied",
  REQUESTER = "requester",
  SYSTEM = "system",
}

export enum AssigneeResolutionNote {
  NOT_A_DESIGNATION = "not_a_designation",
  NO_HOLDER = "no_holder",
  MULTIPLE_HOLDERS = "multiple_holders",
  HOLDER_IS_REQUESTER = "holder_is_requester",
  RESOLVED_BY_FALLBACK = "resolved_by_fallback",
}

export enum TaskErrorCode {
  TASK_NOT_FOUND = "TASK_NOT_FOUND",
  TASK_NOT_ACTIVE = "TASK_NOT_ACTIVE",
  TASK_NOT_DELETABLE = "TASK_NOT_DELETABLE",
  TASK_REVISION_CONFLICT = "TASK_REVISION_CONFLICT",
  TASK_FORM_NOT_FOUND = "TASK_FORM_NOT_FOUND",
  TASK_FORM_ALREADY_SUBMITTED = "TASK_FORM_ALREADY_SUBMITTED",
  TASK_FORM_NOT_AWAITING_INPUT = "TASK_FORM_NOT_AWAITING_INPUT",
  TASK_FORM_INVALID = "TASK_FORM_INVALID",
  TASK_TRANSCRIPT_UNAVAILABLE = "TASK_TRANSCRIPT_UNAVAILABLE",
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

export interface UnsupportedTaskInput {
  input_id: string;
  label: string;
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

export interface TaskSummaryStepDto {
  id: string;
  name: string;
  status: TaskStepStatus;
}

export interface TaskSummaryDto {
  id: string;
  reference: string;
  title: string;
  status: TaskStatus;
  current_steps: TaskSummaryStepDto[];
  progress: TaskProgressDto;
  created_at: string;
  updated_at: string;
}

export interface TaskListResponseDto {
  tasks: TaskSummaryDto[];
  page: { total: number; limit: number; offset: number };
}

export interface TaskWorkflowDefinitionDto {
  definition: Workflow;
}

export type CreateTaskRequest =
  | { source: TaskCreationSource.SELECTION_SESSION; selection_session_id: string }
  | { source: TaskCreationSource.CATALOGUE; workflow_template_id: string };

export interface TaskListQuery {
  status: TaskStatus | null;
  search: string | null;
  limit: number;
  offset: number;
}
