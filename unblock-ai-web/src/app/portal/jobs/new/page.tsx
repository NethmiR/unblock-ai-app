"use client";
import { useRouter } from "next/navigation";
import { useSelectionSession } from "@/lib/hooks/useSelectionSession";
import { SelectionChat } from "@/components/portal/SelectionChat";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import Link from "next/link";

export default function NewJobPage() {
  const router = useRouter();
  const {
    messages,
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

  /**
   * Confirming the process is what commits the request.
   *
   * The dialog is the last decision this page asks for: saying yes saves the
   * job and hands the person to its own page, where the plan is rendered from
   * the stored task. Nothing is sent to any approver by this - the task is
   * created in `collecting`, and `/portal/jobs/:id` is where they pick up
   * filling in their details.
   *
   * A failed save returns null and has already explained itself in the chat,
   * so there is nothing to navigate to and nothing more to say here.
   */
  async function handleConfirm() {
    const taskId = await confirmMatch();
    if (taskId) router.push(`/portal/jobs/${taskId}`);
  }

  return (
    <div className="mx-auto flex h-screen max-w-[1440px] flex-col px-16 pb-7 pt-9">
      <Link
        href="/portal"
        className="mb-6 flex flex-none items-center gap-2.5 self-start text-[14.5px] font-medium text-muted transition-colors hover:text-ink"
      >
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path d="M11 3.5L5.5 9l5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        See other requests
      </Link>

      <div className="mb-6 flex-none">
        <div className="mb-2 text-xs font-medium uppercase tracking-[.14em] text-muted">New request</div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {workflow ? workflow.title : "Create new request"}
        </h1>
      </div>

      <div className="flex min-h-0 flex-1">
        <SelectionChat
          messages={messages}
          decision={decision}
          isBusy={isBusy}
          hasStarted={hasStarted}
          isClosed={workflow !== null}
          onSend={send}
          onChoose={choose}
        />
      </div>

      {/*
        The checkpoint between narrowing down a workflow and saving the job.
        BOTH branches route through here - an automatic `matched` decision and
        an explicit pick from the manual-choice list - because this dialog is
        the only thing standing in front of a saved request.
      */}
      {pendingMatch && (
        <ConfirmDialog
          title="Have we got the right process?"
          confirmLabel="Yes, continue"
          cancelLabel="No, that's not it"
          busy={isBusy}
          busyLabel="Creating your request…"
          onConfirm={handleConfirm}
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
