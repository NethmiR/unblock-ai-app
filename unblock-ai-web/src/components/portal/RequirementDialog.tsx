"use client";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { RequirementField } from "./RequirementField";
import { useTaskCollection } from "@/lib/hooks/useTaskCollection";
import type { NextRequirementDto, TaskDto } from "@/types/task";

/** A `followup:<step_id>:<n>` key means an approver asked this question. */
const isFollowUp = (key: string) => key.startsWith("followup:");

/**
 * Requirement collection for one task, as a modal over its status page.
 *
 * Replaces the former `/portal/jobs/[id]/collect` route. The behaviour is
 * unchanged - same `useTaskCollection` loop, same one-requirement-at-a-time
 * ordering from `GET /tasks/:id/next`, same finalize-and-start on send - but it
 * opens in place, so the plan the person is reading stays behind it instead of
 * being replaced by a form on another URL.
 *
 * Serves BOTH entry points, because the API makes no distinction between them:
 * a brand-new task and a live task an approver sent back for more information
 * are both `status: "collecting"`. What is rendered keys off the requirement,
 * never off how the dialog was opened.
 *
 * Built on the native `<dialog>` element for the same reasons ConfirmDialog is:
 * `showModal()` gives focus trapping, the top layer, and Escape handling with
 * no library and no scroll-locking hacks. The `closingRef` dance is likewise
 * shared - unmounting fires a native `close` event that must not be read back
 * as a user dismiss.
 */
export function RequirementDialog({
  task,
  initialNext,
  onDismiss,
  onSent,
}: {
  task: TaskDto;
  initialNext: NextRequirementDto;
  /** Closing without finishing. The task keeps whatever answers were saved. */
  onDismiss: () => void;
  /**
   * The request has been sent for approval. The caller refreshes from the
   * server rather than being handed the task: sending moves the STATUS view
   * and the timeline too, and both are fetched server-side.
   */
  onSent: () => void;
}) {
  const { task: collectingTask, current, complete, isBusy, error, sent, submit, sendForApproval } =
    useTaskCollection(task, initialNext);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      closingRef.current = true;
      dialog.close();
    };
  }, []);

  /**
   * `sent` is set by the hook the moment approval mail is out. Handing that
   * back to the page from an effect rather than from the click keeps the ONE
   * source of truth in the hook - `sendForApproval` swallows its own errors, so
   * awaiting it at the call site cannot tell success from failure.
   */
  useEffect(() => {
    if (sent) onSent();
  }, [sent, onSent]);

  const answered = collectingTask.requirements.filter((r) => r.status !== "pending").length;
  const total = collectingTask.requirements.length;

  /**
   * A finished task reports `complete: true` from `/next` - every requirement
   * IS filled - which would otherwise render the "Send for approval" button and
   * 409 on click. Only a `collecting` task is actually collecting, so the
   * status decides.
   */
  const isCollecting = collectingTask.status === "collecting";

  /** Nothing is in flight, so dismissing cannot strand a half-saved answer. */
  const dismiss = () => {
    if (!isBusy) onDismiss();
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      onClose={() => {
        if (!isBusy && !closingRef.current) onDismiss();
      }}
      className="fixed inset-0 m-auto h-fit max-h-[calc(100vh-2rem)] w-[min(560px,calc(100vw-2rem))] overflow-y-auto rounded-card border border-line-admin bg-surface p-0 shadow-lg backdrop:bg-black/40"
    >
      <div className="px-7 py-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-[.14em] text-muted">
              {collectingTask.reference}
            </div>
            <div className="text-[17px] font-semibold tracking-tight">A few more details</div>
            {total > 0 && (
              <p className="mt-1 text-[13.5px] text-muted">
                {answered} of {total} answered
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            disabled={isBusy}
            aria-label="Close"
            className="-mr-1.5 -mt-1 flex-none cursor-pointer rounded-lg p-1.5 text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {current && isCollecting ? (
          <>
            {isFollowUp(current.key) && (
              <p className="mb-4 text-[13px] font-semibold uppercase tracking-[.08em] text-warn-ink">
                An approver asked for more information
              </p>
            )}
            {/* Keyed so each requirement gets a fresh, blank control. */}
            <RequirementField
              key={current.key}
              requirement={current}
              isBusy={isBusy}
              onSubmit={submit}
            />
            {error && <p className="mt-4 text-[13.5px] text-danger">{error}</p>}
          </>
        ) : complete && isCollecting ? (
          <>
            <div className="mb-1.5 text-[15px] font-semibold tracking-tight">
              That is everything we need
            </div>
            <p className="mb-6 max-w-[46ch] text-[13.5px] leading-relaxed text-muted">
              Nothing has been sent to any approver yet. Sending will notify the first approver by
              email.
            </p>
            {error && <p className="mb-4 text-[13.5px] text-danger">{error}</p>}
            {/* Finalize and start, deliberately as one action - see useTaskCollection. */}
            <Button
              onClick={sendForApproval}
              disabled={isBusy}
              className="h-[48px] rounded-card px-[22px] text-[15px] font-medium"
            >
              {isBusy ? "Sending…" : "Send for approval"}
            </Button>
          </>
        ) : (
          // The task has moved on from `collecting` - already sent, cancelled,
          // or decided. The page behind this dialog is where that reads
          // properly, so there is nothing to do here but step out of the way.
          <>
            <p className="text-[14.5px] text-ink">
              This request is not collecting information right now.
            </p>
            <Button
              variant="secondary"
              onClick={onDismiss}
              className="mt-5 h-[42px] rounded-card px-5 text-[14px] font-medium"
            >
              Close
            </Button>
          </>
        )}
      </div>
    </dialog>
  );
}
