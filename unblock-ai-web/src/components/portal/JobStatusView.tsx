"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TaskPlanPanel } from "@/components/portal/TaskPlanPanel";
import { RequirementDialog } from "@/components/portal/RequirementDialog";
import { DeleteRequestDialog } from "@/components/portal/DeleteRequestDialog";
import { DateTime } from "@/components/ui/DateTime";
import { tasksApi } from "@/lib/api/tasks";
import { ApiError } from "@/lib/api/client";
import { isDeletable, STATUS_LABEL, STATUS_TONE } from "@/components/portal/JobRow";
import type { TaskStatusDto } from "@/types/approval";
import type { NextRequirementDto, TaskDto, TaskStatus } from "@/types/task";
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
   * Same rule the list row uses. `taskStatus` rather than `task.status` so a
   * request cancelled a moment ago on this page offers its delete straight
   * away; `task.steps` is safe to read from the server copy either way, since
   * cancelling dispatches nothing.
   */
  const canDelete = isDeletable(taskStatus, task.steps);

  /**
   * A completed request is finished business, so the page offers to clear it
   * away - once on arrival, and again on the way out if the first offer was
   * declined. `dismissed` is what makes the second offer the LAST one rather
   * than a loop: without it, declining on close would re-arm the open prompt.
   */
  const [prompt, setPrompt] = useState<Prompt>(isCompleted ? "on-open" : null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  /**
   * Requirement collection, opened over this page instead of on a route of its
   * own. `null` is closed; the value is the `GET /tasks/:id/next` response the
   * dialog starts from.
   *
   * Fetched on open rather than server-side with the rest of the page, because
   * `/next` is only meaningful while the task is `collecting` and most visits
   * here never open the dialog at all. It also has to be FRESH: an approver can
   * append follow-up requirements at any moment, and a snapshot taken at page
   * render would miss them.
   */
  const [collecting, setCollecting] = useState<NextRequirementDto | null>(null);
  const [isOpening, setIsOpening] = useState(false);

  async function openCollection() {
    setIsOpening(true);
    setError(null);
    try {
      setCollecting(await tasksApi.next(taskId));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong opening this form. Please try again.",
      );
    } finally {
      setIsOpening(false);
    }
  }

  /**
   * Closes the dialog and re-reads the task from the server.
   *
   * Both exits refresh, because both can have changed server state: sending
   * moves the task out of `collecting` and writes the timeline, and dismissing
   * part-way still leaves the answers given so far saved - the plan's step and
   * the "answered" count are rendered from the server copy either way.
   *
   * `useCallback` because `RequirementDialog` reports `sent` from an effect
   * keyed on this identity; a fresh function each render would re-run it on
   * every unrelated re-render of this page.
   */
  const closeCollection = useCallback(() => {
    setCollecting(null);
    router.refresh();
  }, [router]);

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

  /**
   * Fetches the completion-document PDF and hands it to the browser as a
   * download - an object URL and a throwaway anchor, since a plain link
   * would need the bearer token the browser can't attach itself.
   */
  async function downloadDocument() {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const { blob, filename } = await tasksApi.document(taskId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong downloading the record. Please try again.",
      );
    } finally {
      setIsDownloading(false);
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
      <button
        type="button"
        onClick={handleBack}
        className="mb-6 flex cursor-pointer items-center gap-2.5 text-[14.5px] font-medium text-muted transition-colors hover:text-ink"
      >
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path d="M11 3.5L5.5 9l5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to my requests
      </button>
      <div className="mb-2 flex items-center justify-between gap-4">
        <div className="text-xs font-medium uppercase tracking-[.14em] text-muted">{status.reference}</div>
        <Badge tone={STATUS_TONE[taskStatus] ?? "neutral"}>{STATUS_LABEL[taskStatus] ?? status.status}</Badge>
      </div>
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">{status.workflow_title}</h1>

      {taskStatus === "collecting" && (
        <Card className="mb-6 px-7 py-6">
          {/* Two very different arrivals share this card: straight from
              creating the request, and coming back after an approver asked a
              question. The timeline is what separates them - an untouched
              task has none. */}
          <p className="mb-4 text-[14.5px] text-ink">
            {status.timeline.length > 0
              ? "An approver asked for more information. Answer it to send this back for approval."
              : "Your request is saved and the plan below is yours. Fill in a few details and it will be ready to send for approval."}
          </p>
          {/* The same action the plan's "Provide details" step offers - this
              card is the one at the top of the page, for someone who has not
              scrolled to the plan yet. Both open the one dialog. */}
          <Button
            onClick={openCollection}
            disabled={isOpening}
            className="h-[46px] rounded-card px-[22px] text-[15px] font-medium"
          >
            {isOpening ? "Opening…" : "Continue"}
          </Button>
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
          <p className="mb-4 text-[14px] leading-relaxed text-muted">
            Every step has been approved, so the assistant is no longer available for this request.
            The full plan below stays available to view. Need something else?{" "}
            <Link href="/portal/jobs/new" className="font-medium text-accent">
              Start a new request
            </Link>
            .
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={isDownloading}
            onClick={downloadDocument}
            className="rounded-control"
          >
            {isDownloading ? "Preparing download…" : "Download record (PDF)"}
          </Button>
          {downloadError && <p className="mt-3 text-[13px] text-danger">{downloadError}</p>}
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
                <div className="flex-none text-[12.5px] text-faint">
                  <DateTime iso={entry.at} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {workflow && (
        <div className="mb-6">
          <TaskPlanPanel
            task={task}
            workflow={workflow}
            /* Only `__inputs` carries an action today; ignoring every other id
               keeps this honest if a later node grows one of its own. */
            onNodeAction={(nodeId) => {
              if (nodeId === "__inputs") openCollection();
            }}
          />
        </div>
      )}

      {error && <p className="mb-4 text-[13.5px] text-danger">{error}</p>}
      {/* Surfaced here too: a delete that failed after the dialog closed would
          otherwise vanish without explanation. */}
      {deleteError && !prompt && <p className="mb-4 text-[13.5px] text-danger">{deleteError}</p>}

      <div className="flex items-center gap-4">
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
        {canDelete && (
          <Button
            variant="secondary"
            onClick={() => setPrompt("on-open")}
            className="ml-auto h-[42px] rounded-card px-5 text-[14px] font-medium text-danger hover:bg-danger/5"
          >
            Delete request
          </Button>
        )}
      </div>

      {collecting && (
        <RequirementDialog
          task={task}
          initialNext={collecting}
          onDismiss={closeCollection}
          onSent={closeCollection}
        />
      )}

      {prompt && (
        <DeleteRequestDialog
          // Keyed so re-opening the prompt starts from its first stage again.
          key={prompt}
          reference={status.reference}
          title={status.workflow_title}
          status={taskStatus}
          busy={isDeleting}
          error={deleteError}
          onConfirm={deleteTask}
          onCancel={prompt === "on-close" ? declineAndLeave : declinePrompt}
        />
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
