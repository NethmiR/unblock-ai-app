"use client";
import Link from "next/link";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import type { TaskDto, TaskStatus } from "@/types/task";

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

export function JobRow({ job }: { job: JobRowTask }) {
  return (
    <Link
      href={`/portal/jobs/${job.id}`}
      className="flex items-center gap-5 rounded-card border border-line bg-surface px-6 py-[22px] transition-all hover:border-slate-300 hover:shadow-[0_2px_10px_rgba(15,23,42,.06)]"
    >
      <StatusIcon status={job.status} />

      <div className="min-w-0 flex-1">
        <div className="text-[16.5px] font-semibold tracking-tight">{job.workflow_title}</div>
        <div className="mt-[5px] text-sm leading-normal text-muted">{job.reference}</div>
      </div>

      <Badge tone={STATUS_TONE[job.status]} className="flex-none">
        {STATUS_LABEL[job.status]}
      </Badge>
    </Link>
  );
}
