"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ApproverList } from "@/components/approvals/ApproverList";
import { ReasonDialog } from "@/components/approvals/ReasonDialog";
import { DateTime } from "@/components/ui/DateTime";
import { approvalsApi } from "@/lib/api/approvals";
import { classifySubmitError } from "@/lib/utils/submit-error";
import type { ApproverViewDto } from "@/types/approval";
import type { StepOutcomeResult } from "@/types/task";

const OUTCOME_LABEL: Record<StepOutcomeResult, string> = {
  approved: "Approve",
  rejected: "Reject",
  request_more_info: "Request more information",
};

const OUTCOME_TONE: Record<StepOutcomeResult, "success" | "danger" | "warn"> = {
  approved: "success",
  rejected: "danger",
  request_more_info: "warn",
};

function DefinitionList({ rows }: { rows: Array<{ label: string; value: string }> }) {
  if (rows.length === 0) return <p className="text-[13.5px] text-muted">Nothing recorded.</p>;
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-6 gap-y-3">
      {rows.map((row, i) => (
        <div key={`${row.label}-${i}`} className="contents">
          <dt className="text-[13px] text-muted">{row.label}</dt>
          <dd className="text-[13.5px] font-medium text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ApproverView({ token, initialView: view }: { token: string; initialView: ApproverViewDto }) {
  const [reason, setReason] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<StepOutcomeResult | null>(null);
  const [pendingOutcome, setPendingOutcome] = useState<StepOutcomeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ outcome: StepOutcomeResult; completed: boolean; terminated: boolean } | null>(null);
  const [blocked, setBlocked] = useState<{ message: string } | null>(null);

  function includeReasonFor(outcome: StepOutcomeResult): boolean {
    return view.outcomes.find((o) => o.outcome === outcome)?.include_reason ?? false;
  }

  function chooseOutcome(outcome: StepOutcomeResult) {
    if (includeReasonFor(outcome)) {
      setReason("");
      setError(null);
      setPendingConfirm(outcome);
      return;
    }
    submit(outcome, null);
  }

  function cancelConfirm() {
    setPendingConfirm(null);
    setReason("");
    setError(null);
  }

  async function submit(outcome: StepOutcomeResult, reasonToSend: string | null) {
    setPendingOutcome(outcome);
    setError(null);
    try {
      const decision = await approvalsApi.submitDecision(token, outcome, reasonToSend);
      setResult({ outcome: decision.outcome, completed: decision.completed, terminated: decision.terminated });
      setPendingConfirm(null);
    } catch (err) {
      const classified = classifySubmitError(err);
      if (classified.kind === "terminal") {
        setBlocked({ message: classified.message });
        setPendingConfirm(null);
      } else {
        setError(classified.message);
      }
    } finally {
      setPendingOutcome(null);
    }
  }

  const alreadyDecided = result !== null || view.already_decided || blocked !== null;
  const decidedOutcome = result?.outcome ?? view.decided_outcome;

  return (
    <div className="mx-auto max-w-[720px] px-6 py-14">
      <div className="mb-2 text-xs font-medium uppercase tracking-[.14em] text-muted">
        {view.task_reference}
      </div>
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">{view.workflow_title}</h1>

      <Card className="mb-6 px-7 py-6">
        <div className="mb-1.5 text-[15px] font-semibold tracking-tight">{view.step.name}</div>
        {view.step.instructions_to_approver && (
          <p className="text-[13.5px] leading-relaxed text-muted">{view.step.instructions_to_approver}</p>
        )}
        {view.approver && (
          <p className="mt-3 text-[13px] text-faint">
            Sent to {view.approver.name} ({view.approver.email})
          </p>
        )}
      </Card>

      <Card className="mb-6 px-7 py-6">
        <div className="mb-4 text-[13px] font-semibold uppercase tracking-[.08em] text-muted">
          Request details
        </div>
        <DefinitionList rows={view.requester_answers} />
      </Card>

      {view.approvers.length > 0 && <ApproverList approvers={view.approvers} />}

      {view.computed.length > 0 && (
        <Card className="mb-6 px-7 py-6">
          <div className="mb-4 text-[13px] font-semibold uppercase tracking-[.08em] text-muted">
            Derived figures
          </div>
          <DefinitionList rows={view.computed} />
        </Card>
      )}

      {alreadyDecided ? (
        <Card className="px-7 py-6">
          {blocked ? (
            <p className="text-[14.5px] text-ink">{blocked.message}</p>
          ) : (
            <>
              {decidedOutcome && (
                <Badge tone={OUTCOME_TONE[decidedOutcome]} className="mb-3">
                  {OUTCOME_LABEL[decidedOutcome]}
                </Badge>
              )}
              <p className="text-[14.5px] text-ink">
                {result ? (
                  "Your decision has been recorded."
                ) : view.decided_at ? (
                  <>
                    This step was already decided on <DateTime iso={view.decided_at} />.
                  </>
                ) : (
                  "This step was already decided."
                )}
              </p>
              {result && (result.completed || result.terminated) && (
                <p className="mt-2 text-[13.5px] text-muted">
                  {result.terminated ? "This request has been terminated." : "This request is now complete."}
                </p>
              )}
            </>
          )}
        </Card>
      ) : (
        <Card className="px-7 py-6">
          {error && !pendingConfirm && (
            <p className="mb-4 text-[13.5px] text-danger">{error}</p>
          )}

          <div className="flex flex-wrap gap-3">
            {view.allowed_outcomes.map((outcome) => (
              <Button
                key={outcome}
                variant={outcome === "approved" ? "primary" : "secondary"}
                disabled={pendingOutcome !== null}
                onClick={() => chooseOutcome(outcome)}
              >
                {pendingOutcome === outcome ? "Submitting…" : OUTCOME_LABEL[outcome]}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {pendingConfirm && (
        <ReasonDialog
          title={`${OUTCOME_LABEL[pendingConfirm]} this request`}
          reason={reason}
          onReasonChange={setReason}
          submitting={pendingOutcome === pendingConfirm}
          error={error}
          onConfirm={() => submit(pendingConfirm, reason.trim())}
          onCancel={cancelConfirm}
        />
      )}
    </div>
  );
}
