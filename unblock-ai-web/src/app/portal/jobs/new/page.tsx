"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSelectionSession } from "@/lib/hooks/useSelectionSession";
import { SelectionChat } from "@/components/portal/SelectionChat";
import { PlanPanel } from "@/components/portal/PlanPanel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { tasksApi } from "@/lib/api/tasks";
import { ApiError } from "@/lib/api/client";
import Link from "next/link";

export default function NewJobPage() {
  const router = useRouter();
  const {
    messages,
    sessionId,
    decision,
    workflow,
    pendingMatch,
    isBusy,
    send,
    choose,
    confirmMatch,
    rejectMatch,
    hasStarted,
  } = useSelectionSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /**
   * Creates the task and hands off to the collection loop.
   *
   * `POST /tasks` 409s unless the session has matched. The button is only
   * rendered once `workflow` is set, which happens on a matched decision and
   * nowhere else - so the precondition is already encoded in the state.
   */
  async function submitRequest() {
    if (!sessionId) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const task = await tasksApi.create(sessionId);
      router.push(`/portal/jobs/${task.id}/collect`);
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong creating your request. Please try again.",
      );
      setIsSubmitting(false);
    }
    // On success the route changes, so `isSubmitting` stays true and the
    // button stays disabled until this page unmounts.
  }

  return (
    <div className="mx-auto flex h-screen max-w-[1440px] flex-col px-16 pb-7 pt-9">
      <div className="mb-6 flex flex-none items-start justify-between gap-8">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-[.14em] text-muted">New request</div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {workflow ? workflow.title : "Create new request"}
          </h1>
        </div>
        <Link href="/portal" className="flex flex-none items-center gap-2.5 px-1 py-2.5 text-[14.5px] font-medium">
          <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M11 3.5L5.5 9l5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          See other requests
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 gap-[22px]">
        <SelectionChat
          messages={messages}
          decision={decision}
          isBusy={isBusy}
          hasStarted={hasStarted}
          isClosed={workflow !== null}
          onSend={send}
          onChoose={choose}
        />
        <PlanPanel
          workflow={workflow}
          onSubmit={submitRequest}
          isSubmitting={isSubmitting}
          error={submitError}
        />
      </div>

      {/*
        The checkpoint between narrowing down a workflow and building the plan
        for it. Only the automatic `matched` decision routes through here - a
        pick from the manual-choice list is already an explicit choice, so
        re-asking there would just make the person say it twice.
      */}
      {pendingMatch && (
        <ConfirmDialog
          title="Have we got the right process?"
          confirmLabel="Yes, continue"
          cancelLabel="No, that's not it"
          onConfirm={confirmMatch}
          onCancel={rejectMatch}
        >
          <p>
            From what you&apos;ve told us, this looks like{" "}
            <span className="font-semibold text-ink">{pendingMatch.title}</span>.
          </p>
          {pendingMatch.retrieval_summary?.one_liner && (
            <p className="mt-2">{pendingMatch.retrieval_summary.one_liner}</p>
          )}
          <p className="mt-3">
            Are you sure you want to request{" "}
            <span className="font-semibold text-ink">{pendingMatch.title}</span>?
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
