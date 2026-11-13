import type { ApprovalDecision, TaskStatus, TaskStepKind, TaskStepOutcome, TaskStepStatus } from "../../../data/constants/task.constant.js";
import type { RequesterSnapshotDto, TaskAssigneeDto } from "../task/task-dto.type.js";
import type { TaskDocument, TaskStepRecord } from "../task/task-document.type.js";

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
