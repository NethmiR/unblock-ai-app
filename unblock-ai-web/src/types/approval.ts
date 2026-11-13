/**
 * TypeScript mirror of unblock-ai-api/src/lib/types/approval/approval.type.ts and
 * unblock-ai-api/src/data/constants/approval-error.constant.ts.
 *
 * WHEN THE SCHEMA CHANGES, CHANGE THIS FILE IN THE SAME COMMIT.
 */
import type { RequesterSnapshotDto } from "./requester";
import type { ApprovalDecision, TaskAssigneeDto, TaskStatus, TaskStepKind, TaskStepOutcome, TaskStepStatus } from "./task";

export enum ApprovalErrorCode {
  APPROVAL_LINK_INVALID = "APPROVAL_LINK_INVALID",
  APPROVAL_LINK_EXPIRED = "APPROVAL_LINK_EXPIRED",
  APPROVAL_ALREADY_DECIDED = "APPROVAL_ALREADY_DECIDED",
  APPROVAL_DECISION_NOT_ALLOWED = "APPROVAL_DECISION_NOT_ALLOWED",
  APPROVAL_COMMENT_REQUIRED = "APPROVAL_COMMENT_REQUIRED",
}

export interface ApproverLabelledValueDto {
  label: string;
  value: string;
}

export interface ApproverViewDto {
  task: { reference: string; title: string; submitted_at: string; requester: RequesterSnapshotDto };
  step: { id: string; name: string; description: string | null; instructions_to_approver: string | null; is_repeat: boolean };
  approver: TaskAssigneeDto;
  sections: Array<{ title: string; fields: ApproverLabelledValueDto[] }>;
  computed: ApproverLabelledValueDto[];
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
