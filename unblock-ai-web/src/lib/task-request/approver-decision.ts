import { TASK_REQUEST_COPY } from "./task-request-copy";
import { TASK_FIELD_LIMIT } from "@/types/task-form";
import { ApprovalDecision } from "@/types/task";
import type { ButtonVariant } from "@/components/ui/button-style";
import type { ApproverViewDto } from "@/types/approval";

const DIALOG = TASK_REQUEST_COPY.approver.dialog;

export const APPROVAL_DECISION_ORDER: readonly ApprovalDecision[] = [
  ApprovalDecision.APPROVED,
  ApprovalDecision.REQUEST_MORE_INFO,
  ApprovalDecision.REJECTED,
];

export const APPROVAL_DECISION_BUTTON_VARIANT: Record<ApprovalDecision, ButtonVariant> = {
  [ApprovalDecision.APPROVED]: "primary",
  [ApprovalDecision.REQUEST_MORE_INFO]: "secondary",
  [ApprovalDecision.REJECTED]: "danger",
};

export const APPROVAL_DECISION_EXPLANATION: Record<ApprovalDecision, string> = {
  [ApprovalDecision.APPROVED]: DIALOG.explanation.approved,
  [ApprovalDecision.REJECTED]: DIALOG.explanation.rejected,
  [ApprovalDecision.REQUEST_MORE_INFO]: DIALOG.explanation.request_more_info,
};

export function offeredDecisions(view: Pick<ApproverViewDto, "allowed_decisions">): ApprovalDecision[] {
  return APPROVAL_DECISION_ORDER.filter((decision) => view.allowed_decisions.includes(decision));
}

export function isCommentRequired(view: Pick<ApproverViewDto, "comment_required_decisions">, decision: ApprovalDecision): boolean {
  return view.comment_required_decisions.includes(decision);
}

export function decisionCommentIssue(comment: string, required: boolean): string | null {
  const trimmed = comment.trim();
  if (required && trimmed.length === 0) return DIALOG.commentMissing;
  if (trimmed.length > TASK_FIELD_LIMIT.COMMENT_MAX_LENGTH) return DIALOG.commentTooLong(TASK_FIELD_LIMIT.COMMENT_MAX_LENGTH);
  return null;
}

export function normaliseDecisionComment(comment: string): string | null {
  const trimmed = comment.trim();
  return trimmed.length > 0 ? trimmed : null;
}
