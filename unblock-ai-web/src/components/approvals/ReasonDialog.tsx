"use client";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";

export function ReasonDialog({
  title,
  reason,
  onReasonChange,
  submitting,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  reason: string;
  onReasonChange: (value: string) => void;
  submitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** Set while unmounting so the resulting native `close` event is not read as a user cancel. */
  const closingRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    textareaRef.current?.focus();
    return () => {
      closingRef.current = true;
      dialog.close();
    };
  }, []);

  const canConfirm = reason.trim().length > 0 && !submitting;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        if (!submitting) onCancel();
      }}
      onClose={() => {
        if (!submitting && !closingRef.current) onCancel();
      }}
      className="fixed inset-0 m-auto h-fit max-h-[calc(100vh-2rem)] w-[min(480px,calc(100vw-2rem))] overflow-y-auto rounded-card border border-line-admin bg-surface p-0 shadow-lg backdrop:bg-black/40"
    >
      <div className="px-6 py-5">
        <div className="mb-4 text-[15px] font-semibold tracking-tight">{title}</div>

        <label className="mb-2 block text-[13px] font-medium text-muted" htmlFor="reason">
          Reason
        </label>
        <textarea
          ref={textareaRef}
          id="reason"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          rows={3}
          placeholder="Add context for your decision…"
          className="mb-2 w-full resize-none rounded-control border border-line-admin bg-surface px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-faint focus:outline-none"
        />
        {!canConfirm && !submitting && (
          <p className="mb-4 text-[12.5px] text-faint">A reason is required to continue.</p>
        )}
        {error && <p className="mb-4 text-[12.5px] text-danger">{error}</p>}

        <div className="mt-4 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={!canConfirm}>
            {submitting ? "Submitting…" : "Confirm"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
