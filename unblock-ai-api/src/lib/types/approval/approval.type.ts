import type { ApprovalAssignmentState } from "../../../data/constants/approval.constant.js";
import type { ApprovalChannel, ApprovalDecision, TaskStatus, TaskStepKind, TaskStepOutcome, TaskStepStatus } from "../../../data/constants/task.constant.js";
import type { RequesterSnapshotDto, TaskAssigneeDto } from "../task/task-dto.type.js";
import type { TaskDocument, TaskStepRecord } from "../task/task-document.type.js";
import type { TaskFormRecord } from "../task/task-form.type.js";

export interface ApproverViewDto {
  task: { reference: string; title: string; submitted_at: string; requester: RequesterSnapshotDto };
  step: { id: string; name: string; description: string | null; instructions_to_approver: string | null; is_repeat: boolean };
  approver: TaskAssigneeDto;
  sections: Array<{ title: string; fields: Array<{ label: string; value: string }> }>;
  computed: Array<{ label: string; value: string }>;
  information_exchanges: Array<{ asked_by: string; question: string; answer: string | null; asked_at: string; answered_at: string | null }>;
  history: Array<{ step_name: string; actor_name: string | null; decision: ApprovalDecision | null; outcome: TaskStepOutcome; comment: string | null; at: string }>;
  plan: Array<{ name: string; kind: TaskStepKind; status: TaskStepStatus; assignee: TaskAssigneeDto | null; is_current: boolean }>;
  allowed_decisions: ApprovalDecision[];
  comment_required_decisions: ApprovalDecision[];
  decided: { decision: ApprovalDecision; comment: string | null; decided_at: string } | null;
}

export interface ApprovalDecisionInputDto {
  decision: ApprovalDecision;
  comment: string | null;
}

export interface ApprovalDecisionResultDto {
  decision: ApprovalDecision;
  task_status: TaskStatus;
  next_step_name: string | null;
}

export interface ApprovalContext {
  task: TaskDocument;
  step: TaskStepRecord;
  live: boolean;
}

export interface ApproverView {
  context: ApprovalContext;
  allowedDecisions: ApprovalDecision[];
  computed: Array<{ label: string; value: string }>;
}

export interface ApprovalActor {
  channel: ApprovalChannel;
  user_id: string | null;
}

export interface ApprovalAssignmentFilter {
  state: ApprovalAssignmentState;
  decision: ApprovalDecision | null;
  search: string | null;
  limit: number;
  offset: number;
}

export type TaskFormSubmissionStamp = Pick<TaskFormRecord, "step_id" | "submitted_at">;

export type TaskAssignmentProjection = Omit<TaskDocument, "forms" | "values" | "conversation" | "audit" | "steps"> & {
  forms: TaskFormSubmissionStamp[];
  active_step_name: string | null;
};

export interface ApprovalAssignmentRow {
  task: TaskAssignmentProjection;
  step: TaskStepRecord;
}

export interface ApprovalAssignmentPage {
  rows: ApprovalAssignmentRow[];
  total: number;
}

export interface ApprovalAssignmentDto {
  task_id: string;
  step_id: string;
  reference: string;
  title: string;
  requester: { full_name: string; email: string; unit_names: string[] };
  step_name: string;
  is_repeat: boolean;
  task_status: TaskStatus;
  current_step_name: string | null;
  submitted_at: string;
  activated_at: string | null;
  decision: ApprovalDecision | null;
  comment: string | null;
  decided_at: string | null;
  decided_via: ApprovalChannel | null;
}

export interface ApprovalAssignmentListResponseDto {
  approvals: ApprovalAssignmentDto[];
  page: { total: number; limit: number; offset: number };
}

export interface ApprovalAssignmentSummaryDto {
  pending: number;
}
