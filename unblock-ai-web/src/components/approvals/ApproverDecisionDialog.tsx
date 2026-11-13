"use client";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField } from "@/components/ui/form/FormField";
import { TextArea } from "@/components/ui/form/TextArea";
import { APPROVAL_DECISION_EXPLANATION, decisionCommentIssue } from "@/lib/task-request/approver-decision";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { APPROVAL_DECISION_PRESENTATION } from "@/lib/task-request/task-status-presentation";
import { TASK_FIELD_LIMIT } from "@/types/task-form";
import { ApprovalDecision } from "@/types/task";

const DIALOG = TASK_REQUEST_COPY.approver.dialog;

interface ApproverDecisionDialogProps {
  decision: ApprovalDecision;
  commentRequired: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: (comment: string) => void;
  onCancel: () => void;
}

export function ApproverDecisionDialog({ decision, commentRequired, busy, error, onConfirm, onCancel }: ApproverDecisionDialogProps) {
  const [comment, setComment] = useState("");
  const [attempted, setAttempted] = useState(false);
  const issue = decisionCommentIssue(comment, commentRequired);
  const action = APPROVAL_DECISION_PRESENTATION[decision].actionLabel;

  const confirm = () => {
    setAttempted(true);
    if (issue === null) onConfirm(comment);
  };

  return (
    <ConfirmDialog
      title={DIALOG.title(action)}
      confirmLabel={action}
      cancelLabel={DIALOG.cancel}
      tone={decision === ApprovalDecision.REJECTED ? "danger" : "default"}
      busy={busy}
      busyLabel={DIALOG.busy}
      error={error}
      onConfirm={confirm}
      onCancel={onCancel}
    >
      <p className="mb-4">{APPROVAL_DECISION_EXPLANATION[decision]}</p>
      <FormField
        label={DIALOG.commentLabel}
        required={commentRequired}
        hint={
          <span className="flex justify-between gap-3">
            <span>{commentRequired ? DIALOG.commentRequired : DIALOG.commentOptional}</span>
            <span aria-hidden="true">{DIALOG.characterCount(comment.length, TASK_FIELD_LIMIT.COMMENT_MAX_LENGTH)}</span>
          </span>
        }
        error={attempted ? issue : null}
      >
        {(control) => (
          <TextArea
            {...control}
            rows={4}
            autoFocus
            value={comment}
            maxLength={TASK_FIELD_LIMIT.COMMENT_MAX_LENGTH}
            disabled={busy}
            invalid={attempted && issue !== null}
            onChange={(event) => setComment(event.target.value)}
          />
        )}
      </FormField>
    </ConfirmDialog>
  );
}
