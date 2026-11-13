"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DateTime } from "@/components/ui/DateTime";
import { Notice } from "@/components/ui/Notice";
import { ApprovalDecisionBadge } from "@/components/task-requests/shared/TaskStatusBadges";
import { ApproverDecisionDialog } from "./ApproverDecisionDialog";
import { ApproverSectionHeading } from "./ApproverSection";
import {
  APPROVAL_DECISION_BUTTON_VARIANT,
  isCommentRequired,
  normaliseDecisionComment,
  offeredDecisions,
} from "@/lib/task-request/approver-decision";
import { hasErrorCode, taskRequestErrorMessage } from "@/lib/task-request/task-error-message";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { APPROVAL_DECISION_PRESENTATION } from "@/lib/task-request/task-status-presentation";
import { ApprovalErrorCode, type ApprovalDecisionInputDto, type ApprovalDecisionResultDto, type ApproverViewDto } from "@/types/approval";
import type { ApprovalDecision } from "@/types/task";

const COPY = TASK_REQUEST_COPY.approver;

function DecidedCard({ decided, result }: { decided: NonNullable<ApproverViewDto["decided"]>; result: ApprovalDecisionResultDto | null }) {
  return (
    <div role="status" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] font-semibold text-ink">{COPY.decidedTitle}</p>
        <ApprovalDecisionBadge decision={decided.decision} />
      </div>
      <p className="whitespace-pre-wrap text-[13.5px] text-ink">{decided.comment ?? <span className="text-muted">{COPY.noComment}</span>}</p>
      <p className="text-[12px] text-muted">
        {COPY.decidedOn} <DateTime iso={decided.decided_at} />
      </p>
      {result && (
        <p className="text-[13px] text-muted">{result.next_step_name ? COPY.nextStep(result.next_step_name) : COPY.taskEnded}</p>
      )}
    </div>
  );
}

export interface ApproverDecisionHandlers {
  onDecide: (input: ApprovalDecisionInputDto) => Promise<ApprovalDecisionResultDto>;
  onDecided: (result: ApprovalDecisionResultDto | null) => void;
}

interface ApproverDecisionPanelProps extends ApproverDecisionHandlers {
  view: ApproverViewDto;
}

export function ApproverDecisionPanel({ view, onDecide, onDecided }: ApproverDecisionPanelProps) {
  const [selected, setSelected] = useState<ApprovalDecision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<ApprovalDecisionResultDto | null>(null);
  const [optimistic, setOptimistic] = useState<ApproverViewDto["decided"]>(null);

  const decided = view.decided ?? optimistic;
  const decisions = offeredDecisions(view);

  const close = () => {
    setSelected(null);
    setError(null);
  };

  const submit = async (decision: ApprovalDecision, rawComment: string) => {
    setBusy(true);
    setError(null);
    const comment = normaliseDecisionComment(rawComment);
    try {
      const outcome = await onDecide({ decision, comment });
      setResult(outcome);
      setOptimistic({ decision, comment, decided_at: new Date().toISOString() });
      setSelected(null);
      onDecided(outcome);
    } catch (err: unknown) {
      if (hasErrorCode(err, ApprovalErrorCode.APPROVAL_ALREADY_DECIDED)) {
        setSelected(null);
        setNotice(COPY.alreadyDecided);
        onDecided(null);
      } else {
        setError(taskRequestErrorMessage(err, COPY.dialog.failed));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="px-5 py-4">
      <ApproverSectionHeading>{COPY.decisionHeading}</ApproverSectionHeading>
      <p className="text-[15px] font-semibold text-ink">{view.step.name}</p>
      {view.step.description && <p className="mt-1 text-[13px] text-muted">{view.step.description}</p>}

      {view.step.is_repeat && (
        <Notice className="mt-3">{COPY.repeatReview}</Notice>
      )}

      {view.step.instructions_to_approver && (
        <div className="mt-3">
          <p className="text-[12px] font-semibold text-muted">{COPY.instructionsHeading}</p>
          <p className="mt-0.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{view.step.instructions_to_approver}</p>
        </div>
      )}

      {notice && <Notice tone="warn" className="mt-3">{notice}</Notice>}

      <hr className="my-4 border-line-admin" />

      {decided ? (
        <DecidedCard decided={decided} result={result} />
      ) : decisions.length > 0 ? (
        <div role="group" aria-label={COPY.decisionsLabel} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {decisions.map((decision) => (
            <Button
              key={decision}
              type="button"
              variant={APPROVAL_DECISION_BUTTON_VARIANT[decision]}
              leadingIcon={APPROVAL_DECISION_PRESENTATION[decision].icon}
              onClick={() => setSelected(decision)}
            >
              {APPROVAL_DECISION_PRESENTATION[decision].actionLabel}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-muted">{COPY.noDecisionsAvailable}</p>
      )}

      {selected && (
        <ApproverDecisionDialog
          key={selected}
          decision={selected}
          commentRequired={isCommentRequired(view, selected)}
          busy={busy}
          error={error}
          onConfirm={(comment) => void submit(selected, comment)}
          onCancel={close}
        />
      )}
    </Card>
  );
}
