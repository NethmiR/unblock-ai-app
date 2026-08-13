"use client";
import Link from "next/link";
import { Spinner } from "@/components/ui/Spinner";
import type { Job } from "@/lib/fixtures/jobs";

/** Status indicator as a lookup, not a conditional chain. */
function StatusIcon({ status }: { status: Job["status"] }) {
  if (status === "in_progress") return <Spinner size={34} />;

  const isDone = status === "completed";
  return (
    <div
      className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full ${
        isDone ? "bg-success" : "bg-danger"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        {isDone ? (
          <path d="M3.5 8.4l3 3 6-6.8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M4 4l8 8M12 4l-8 8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        )}
      </svg>
    </div>
  );
}

export function JobRow({ job, onDelete }: { job: Job; onDelete?: (id: string) => void }) {
  return (
    <div className="flex items-center gap-5 rounded-card border border-line bg-surface px-6 py-[22px] transition-all hover:border-slate-300 hover:shadow-[0_2px_10px_rgba(15,23,42,.06)]">
      <StatusIcon status={job.status} />

      <Link href={`/portal/jobs/${job.id}`} className="min-w-0 flex-1">
        <div className="text-[16.5px] font-semibold tracking-tight">{job.title}</div>
        <div className="mt-[5px] text-sm leading-normal text-muted">{job.description}</div>
      </Link>

      <div className="flex-none text-xs font-medium uppercase tracking-[.08em] text-muted">
        {job.statusLabel}
      </div>

      <button
        onClick={() => onDelete?.(job.id)}
        aria-label={`Delete ${job.title}`}
        className="flex h-9 w-9 flex-none items-center justify-center rounded-control border border-transparent hover:border-line hover:bg-bg"
      >
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path d="M3 4.5h12M7 4.5V3h4v1.5M4.5 4.5l.8 10a1 1 0 001 .9h5.4a1 1 0 001-.9l.8-10M7.5 7.5v5M10.5 7.5v5"
            stroke="#475569" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
