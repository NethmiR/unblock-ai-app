"use client";
import Link from "next/link";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import type { TaskDto, TaskStatus, TaskStepState } from "@/types/task";

/** Status copy and badge tone as data, not as an if/else chain. */
export const STATUS_LABEL: Record<TaskStatus, string> = {
  collecting: "Collecting details",
  ready: "Ready to send",
  in_progress: "In progress",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const STATUS_TONE: Record<TaskStatus, "neutral" | "warn" | "success" | "danger"> = {
  collecting: "neutral",
  ready: "neutral",
  in_progress: "warn",
  completed: "success",
  rejected: "danger",
  cancelled: "neutral",
};

/** Status indicator as a lookup, not a conditional chain. */
function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === "in_progress") return <Spinner size={34} />;

  if (status === "completed") {
    return (
      <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-success">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3.5 8.4l3 3 6-6.8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-danger">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // collecting, ready, cancelled - no strong verdict yet, a neutral dot.
  return (
    <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full border border-line bg-bg">
      <div className="h-2.5 w-2.5 rounded-full bg-muted" />
    </div>
  );
}

export interface JobRowTask extends TaskDto {
  /** Joined from `workflowsApi.list()` - `TaskDto` carries no title of its own. */
  workflow_title: string;
}

/** Finished business, whichever way it finished - `DELETE /tasks/:id` takes all three. */
const TERMINAL: TaskStatus[] = ["completed", "rejected", "cancelled"];

/**
 * Mirrors `TaskService.isDeletable` on the API - keep the two in step.
 *
 * What the endpoint refuses is a request whose approval links are already in
 * approvers' inboxes, since deleting it turns those links into 404s. A terminal
 * request is past that. So is one still collecting details that has never
 * dispatched a step: nothing was sent, so there is nothing to orphan, and there
 * is no reason to make the requester cancel a request they never started.
 *
 * The second half tests DISPATCH, not status: a request reopened by an
 * approver's "more info" question is `collecting` again while that approver
 * still holds a live link, and the step signals are what catch it. Anything
 * else - ready to send, or out for approval - gets no delete control at all,
 * rather than one that fails.
 */
export function isDeletable(status: TaskStatus, steps: TaskStepState[]): boolean {
  if (TERMINAL.includes(status)) return true;

  return (
    status === "collecting" &&
    !steps.some((s) => s.approval_token !== null || s.notified_at !== null || s.outcome !== null)
  );
}

/**
 * One row of the requester's job list.
 *
 * The delete control is a SIBLING of the link, not a child: a button nested in
 * an anchor is invalid HTML and gets the click semantics wrong. The link is
 * stretched over the row with an inset overlay instead, so the whole row still
 * navigates while the button keeps its own hit area - the same arrangement the
 * admin's TemplateRow uses.
 */
export function JobRow({
  job,
  onDelete,
}: {
  job: JobRowTask;
  /** Omitted where the list has nothing to do with a delete, e.g. a read-only view. */
  onDelete?: (job: JobRowTask) => void;
}) {
  const canDelete = onDelete && isDeletable(job.status, job.steps);

  return (
    <div className="relative flex items-center gap-5 rounded-card border border-line bg-surface px-6 py-[22px] transition-all hover:border-slate-300 hover:shadow-[0_2px_10px_rgba(15,23,42,.06)]">
      <Link
        href={`/portal/jobs/${job.id}`}
        className="absolute inset-0 z-0 rounded-card"
        aria-label={`Open ${job.workflow_title}`}
      />

      <div className="pointer-events-none relative">
        <StatusIcon status={job.status} />
      </div>

      <div className="pointer-events-none relative min-w-0 flex-1">
        <div className="text-[16.5px] font-semibold tracking-tight">{job.workflow_title}</div>
        <div className="mt-[5px] text-sm leading-normal text-muted">{job.reference}</div>
      </div>

      <Badge tone={STATUS_TONE[job.status]} className="pointer-events-none relative flex-none">
        {STATUS_LABEL[job.status]}
      </Badge>

      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete(job)}
          aria-label={`Delete ${job.reference}`}
          title="Delete request"
          className="relative z-10 flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-control text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:bg-danger/10 focus-visible:text-danger focus-visible:outline-none"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 4h11M6.5 4V2.75A.75.75 0 0 1 7.25 2h1.5a.75.75 0 0 1 .75.75V4M12.5 4l-.6 8.4a1 1 0 0 1-1 .93H5.1a1 1 0 0 1-1-.93L3.5 4M6.6 6.8v4M9.4 6.8v4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
