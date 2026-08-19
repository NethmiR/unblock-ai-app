"use client";
import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/utils/format";
import { tasksApi } from "@/lib/api/tasks";
import { ApiError } from "@/lib/api/client";
import { STATUS_LABEL, STATUS_TONE } from "@/components/portal/JobRow";
import type { TaskStatusDto } from "@/types/approval";
import type { TaskStatus } from "@/types/task";

/** `PATCH /tasks/:id/status` 409s on any of these - hide the control rather than let it fail. */
const TERMINAL: TaskStatus[] = ["completed", "rejected", "cancelled"];

function DefinitionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-[13.5px]">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

export function JobStatusView({ taskId, initialStatus }: { taskId: string; initialStatus: TaskStatusDto }) {
  const [status, setStatus] = useState(initialStatus);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taskStatus = status.status as TaskStatus;
  const canCancel = !TERMINAL.includes(taskStatus);

  async function cancel() {
    setIsCancelling(true);
    setError(null);
    try {
      await tasksApi.cancel(taskId);
      setStatus((s) => ({ ...s, status: "cancelled" }));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong cancelling this request. Please try again.",
      );
      setIsCancelling(false);
    }
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 py-14">
      <div className="mb-2 flex items-center justify-between gap-4">
        <div className="text-xs font-medium uppercase tracking-[.14em] text-muted">{status.reference}</div>
        <Badge tone={STATUS_TONE[taskStatus] ?? "neutral"}>{STATUS_LABEL[taskStatus] ?? status.status}</Badge>
      </div>
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">{status.workflow_title}</h1>

      {taskStatus === "collecting" && (
        <Card className="mb-6 px-7 py-6">
          <p className="mb-4 text-[14.5px] text-ink">
            {status.timeline.length > 0
              ? "An approver asked for more information. Answer it to send this back for approval."
              : "This request still needs a few details before it can be sent for approval."}
          </p>
          <Link href={`/portal/jobs/${taskId}/collect`}>
            <Button className="h-[46px] rounded-card px-[22px] text-[15px] font-medium">
              Continue
            </Button>
          </Link>
        </Card>
      )}

      {status.current_steps.length > 0 && (
        <Card className="mb-6 px-7 py-6">
          <div className="mb-3 text-[13px] font-semibold uppercase tracking-[.08em] text-muted">
            Waiting on
          </div>
          <div className="flex flex-col gap-1.5">
            {status.current_steps.map((step) => (
              <p key={step} className="text-[14.5px] text-ink">{step}</p>
            ))}
          </div>
        </Card>
      )}

      {taskStatus === "rejected" && (
        <Card className="mb-6 px-7 py-6">
          <div className="mb-3 text-[13px] font-semibold uppercase tracking-[.08em] text-muted">
            Rejected
          </div>
          <div className="flex flex-col gap-2">
            {status.rejected_at_step && <DefinitionRow label="Step" value={status.rejected_at_step} />}
            {status.rejected_by && <DefinitionRow label="Rejected by" value={status.rejected_by} />}
          </div>
          {status.reason && <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{status.reason}</p>}
        </Card>
      )}

      {status.timeline.length > 0 && (
        <Card className="mb-6 px-7 py-6">
          <div className="mb-4 text-[13px] font-semibold uppercase tracking-[.08em] text-muted">
            Timeline
          </div>
          <div className="flex flex-col gap-3">
            {status.timeline.map((entry, i) => (
              <div key={`${entry.step}-${i}`} className="flex items-start justify-between gap-4 text-[13.5px]">
                <div>
                  <span className="font-medium text-ink">{entry.step}</span>
                  {entry.outcome && <span className="text-muted"> — {entry.outcome}</span>}
                  {entry.reason && <p className="mt-1 text-[13px] text-muted">{entry.reason}</p>}
                </div>
                <div className="flex-none text-[12.5px] text-faint">{formatDateTime(entry.at)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {error && <p className="mb-4 text-[13.5px] text-danger">{error}</p>}

      <div className="flex items-center gap-4">
        <Link href="/portal" className="text-[14px] font-medium text-muted">
          Back to my requests
        </Link>
        {canCancel && (
          <Button
            variant="secondary"
            disabled={isCancelling}
            onClick={cancel}
            className="ml-auto h-[42px] rounded-card px-5 text-[14px] font-medium"
          >
            {isCancelling ? "Cancelling…" : "Cancel request"}
          </Button>
        )}
      </div>
    </div>
  );
}
