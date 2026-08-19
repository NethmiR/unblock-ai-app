"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/utils/format";
import { approvalsApi } from "@/lib/api/approvals";
import { ApiError } from "@/lib/api/client";
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
  const [pendingOutcome, setPendingOutcome] = useState<StepOutcomeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ outcome: StepOutcomeResult; completed: boolean; terminated: boolean } | null>(null);

  async function submit(outcome: StepOutcomeResult) {
    setPendingOutcome(outcome);
    setError(null);
    try {
      const decision = await approvalsApi.submitDecision(token, outcome, reason.trim() || null);
      setResult({ outcome: decision.outcome, completed: decision.completed, terminated: decision.terminated });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong submitting your decision. Please try again.");
    } finally {
      setPendingOutcome(null);
    }
  }

  const alreadyDecided = result !== null || view.already_decided;
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

      {view.computed.length > 0 && (
        <Card className="mb-6 px-7 py-6">
          <div className="mb-4 text-[13px] font-semibold uppercase tracking-[.08em] text-muted">
            Derived figures
          </div>
          <DefinitionList rows={view.computed} />
        </Card>
      )}

      {view.prior_decisions.length > 0 && (
        <Card className="mb-6 px-7 py-6">
          <div className="mb-4 text-[13px] font-semibold uppercase tracking-[.08em] text-muted">
            What happened already
          </div>
          <div className="flex flex-col gap-3">
            {view.prior_decisions.map((d, i) => (
              <div key={`${d.step}-${i}`} className="flex items-start justify-between gap-4 text-[13.5px]">
                <div>
                  <span className="font-medium text-ink">{d.step}</span>
                  <span className="text-muted"> — {d.outcome}</span>
                  {d.reason && <p className="mt-1 text-[13px] text-muted">{d.reason}</p>}
                </div>
                <div className="flex-none text-[12.5px] text-faint">{formatDateTime(d.at)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {alreadyDecided ? (
        <Card className="px-7 py-6">
          {decidedOutcome && (
            <Badge tone={OUTCOME_TONE[decidedOutcome]} className="mb-3">
              {OUTCOME_LABEL[decidedOutcome]}
            </Badge>
          )}
          <p className="text-[14.5px] text-ink">
            {result
              ? "Your decision has been recorded."
              : `This step was already decided${view.decided_at ? ` on ${formatDateTime(view.decided_at)}` : ""}.`}
          </p>
          {result && (result.completed || result.terminated) && (
            <p className="mt-2 text-[13.5px] text-muted">
              {result.terminated ? "This request has been terminated." : "This request is now complete."}
            </p>
          )}
        </Card>
      ) : (
        <Card className="px-7 py-6">
          <label className="mb-2 block text-[13px] font-medium text-muted" htmlFor="reason">
            Reason <span className="text-faint">(optional, unless the server asks for one)</span>
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Add context for your decision…"
            className="mb-5 w-full resize-none rounded-control border border-line-admin bg-surface px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-faint focus:outline-none"
          />

          {error && (
            <p className="mb-4 text-[13.5px] text-danger">{error}</p>
          )}

          <div className="flex flex-wrap gap-3">
            {view.allowed_outcomes.map((outcome) => (
              <Button
                key={outcome}
                variant={outcome === "approved" ? "primary" : "secondary"}
                disabled={pendingOutcome !== null}
                onClick={() => submit(outcome)}
              >
                {pendingOutcome === outcome ? "Submitting…" : OUTCOME_LABEL[outcome]}
              </Button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
