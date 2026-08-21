"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

interface ConfirmDialogProps {
  title: string;
  /** Body copy, or richer content when the caller needs an input inside the dialog. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` paints the confirm button red - reserve it for destructive actions. */
  tone?: "default" | "danger";
  /** False keeps the confirm button disabled, e.g. until a typed confirmation matches. */
  canConfirm?: boolean;
  busy?: boolean;
  busyLabel?: string;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A centred modal for confirming one action.
 *
 * Built on the native `<dialog>` element for the same reasons ReasonDialog is:
 * `showModal()` gives focus trapping, the top layer, and Escape handling with
 * no library and no scroll-locking hacks. The `closingRef` dance is likewise
 * shared - unmounting fires a native `close` event that must not be read back
 * as a user cancel.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  canConfirm = true,
  busy = false,
  busyLabel,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
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

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      onClose={() => {
        if (!busy && !closingRef.current) onCancel();
      }}
      className="fixed inset-0 m-auto h-fit max-h-[calc(100vh-2rem)] w-[min(480px,calc(100vw-2rem))] overflow-y-auto rounded-card border border-line-admin bg-surface p-0 shadow-lg backdrop:bg-black/40"
    >
      <div className="px-6 py-5">
        <div className="mb-3 text-[15px] font-semibold tracking-tight">{title}</div>

        <div className="text-[13.5px] leading-relaxed text-muted">{children}</div>

        {error && <p className="mt-4 text-[12.5px] text-danger">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={!canConfirm || busy}
            className={cn(
              tone === "danger" &&
                "bg-danger hover:bg-danger/90 disabled:bg-slate-200 disabled:text-muted",
            )}
          >
            {busy ? busyLabel ?? `${confirmLabel}…` : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
