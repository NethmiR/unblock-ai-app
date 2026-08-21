"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TaskPlanPanel } from "@/components/portal/TaskPlanPanel";
import { formatDateTime } from "@/lib/utils/format";
import { tasksApi } from "@/lib/api/tasks";
import { ApiError } from "@/lib/api/client";
import { STATUS_LABEL, STATUS_TONE } from "@/components/portal/JobRow";
import type { TaskStatusDto } from "@/types/approval";
import type { TaskDto, TaskStatus } from "@/types/task";
import type { Workflow } from "@/types/workflow";

/** `PATCH /tasks/:id/status` 409s on any of these - hide the control rather than let it fail. */
const TERMINAL: TaskStatus[] = ["completed", "rejected", "cancelled"];

/** Which delete prompt is on screen. `null` is the ordinary state - no dialog. */
type Prompt = "on-open" | "on-close" | null;

function DefinitionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-[13.5px]">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

export function JobStatusView({
  taskId,
  initialStatus,
  task,
  workflow,
}: {
  taskId: string;
  initialStatus: TaskStatusDto;
  task: TaskDto;
  /** Null when the template behind this task no longer exists - the plan is then omitted. */
  workflow: Workflow | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taskStatus = status.status as TaskStatus;
  const canCancel = !TERMINAL.includes(taskStatus);
  const isCompleted = taskStatus === "completed";

  /**
   * A completed request is finished business, so the page offers to clear it
   * away - once on arrival, and again on the way out if the first offer was
   * declined. `dismissed` is what makes the second offer the LAST one rather
   * than a loop: without it, declining on close would re-arm the open prompt.
   */
  const [prompt, setPrompt] = useState<Prompt>(isCompleted ? "on-open" : null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  async function deleteTask() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await tasksApi.remove(taskId);
      // The task is gone, so this route now 404s - replace rather than push so
      // Back does not land on a dead page, and refresh so the list drops the row.
      router.replace("/portal");
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong deleting this request. Please try again.",
      );
      setIsDeleting(false);
    }
  }

  /** Declining the on-open offer leaves the reader on the page. */
  function declinePrompt() {
    if (isDeleting) return;
    setPrompt(null);
    setDeleteError(null);
  }

  /** Declining on the way out still means they asked to leave - so leave. */
  function declineAndLeave() {
    if (isDeleting) return;
    setPrompt(null);
    setDeleteError(null);
    router.push("/portal");
  }

  /**
   * Leaving a completed request asks once more before navigating, which is why
   * this is a button rather than a Link - the navigation happens after the
   * answer, in `declineAndLeave` or `deleteTask`.
   */
  function handleBack() {
    if (isCompleted) {
      setPrompt("on-close");
      return;
    }
    router.push("/portal");
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

      {/* A finished request has nothing left to discuss, so the assistant is
          closed off. Saying so beats silently omitting it. */}
      {isCompleted && (
        <Card className="mb-6 px-7 py-6">
          <div className="mb-2 flex items-center gap-2.5">
            <LockIcon />
            <span className="text-[15px] font-semibold tracking-tight">This request is closed</span>
          </div>
          <p className="text-[14px] leading-relaxed text-muted">
            Every step has been approved, so the assistant is no longer available for this request.
            The full plan below stays available to view. Need something else?{" "}
            <Link href="/portal/jobs/new" className="font-medium text-accent">
              Start a new request
            </Link>
            .
          </p>
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

      {workflow && (
        <div className="mb-6">
          <TaskPlanPanel task={task} workflow={workflow} />
        </div>
      )}

      {error && <p className="mb-4 text-[13.5px] text-danger">{error}</p>}
      {/* Surfaced here too: a delete that failed after the dialog closed would
          otherwise vanish without explanation. */}
      {deleteError && !prompt && <p className="mb-4 text-[13.5px] text-danger">{deleteError}</p>}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleBack}
          className="cursor-pointer text-[14px] font-medium text-muted transition-colors hover:text-ink"
        >
          Back to my requests
        </button>
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
        {isCompleted && (
          <Button
            variant="secondary"
            onClick={() => setPrompt("on-open")}
            className="ml-auto h-[42px] rounded-card px-5 text-[14px] font-medium text-danger hover:bg-danger/5"
          >
            Delete request
          </Button>
        )}
      </div>

      {prompt && (
        <ConfirmDialog
          title="Delete this completed request?"
          confirmLabel="Delete request"
          busyLabel="Deleting…"
          cancelLabel={prompt === "on-close" ? "No, just go back" : "No, keep it"}
          tone="danger"
          busy={isDeleting}
          error={deleteError}
          onConfirm={deleteTask}
          onCancel={prompt === "on-close" ? declineAndLeave : declinePrompt}
        >
          <p>
            <span className="font-semibold text-ink">{status.reference}</span> has been completed,
            so nothing further will happen to it. Deleting removes it from your requests
            permanently — the approval record is kept for the institution&apos;s audit trail.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="text-muted">
      <path
        d="M4.5 7V5.25a3.5 3.5 0 1 1 7 0V7M3.75 7h8.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-.75.75h-8.5a.75.75 0 0 1-.75-.75v-5.5A.75.75 0 0 1 3.75 7Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
