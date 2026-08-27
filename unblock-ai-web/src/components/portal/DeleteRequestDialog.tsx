"use client";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { TaskStatus } from "@/types/task";

/**
 * The requester's counterpart to the admin's DeleteTemplateDialog.
 *
 * Two stages. The first one always asks the plain yes/no question - nobody
 * should meet a type-to-confirm box before they have said they want to delete
 * anything at all, least of all on a page that opens the prompt by itself. Its
 * WORDING is what varies: an approved request is finished business being
 * cleared away, while a rejected or cancelled one never finished, so each is
 * named for what it is. Both paths end at the same type-to-confirm step - the
 * word, and only the word, per the portal's simpler bar than the admin's
 * word-plus-title.
 */
type Stage = "confirm-intent" | "type-to-confirm";

/** Case- and whitespace-insensitive, mirroring the admin dialog's comparison. */
const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

export function DeleteRequestDialog({
  reference,
  title,
  status,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  /** The request's own code, e.g. `REQ-2401` - what the reader recognises it by. */
  reference: string;
  /** The template this request was raised from. */
  title: string;
  /** Only terminal statuses reach here; each gets its own first-stage wording. */
  status: TaskStatus;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isCompleted = status === "completed";
  const [stage, setStage] = useState<Stage>("confirm-intent");
  const [word, setWord] = useState("");
  const wordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === "type-to-confirm") wordRef.current?.focus();
  }, [stage]);

  if (stage === "confirm-intent") {
    return (
      <ConfirmDialog
        title={isCompleted ? "This request is already approved" : "This request was never completed"}
        confirmLabel="Yes, delete it"
        cancelLabel="No, keep it"
        tone="danger"
        onConfirm={() => setStage("type-to-confirm")}
        onCancel={onCancel}
      >
        <p>
          <span className="font-semibold text-ink">{reference}</span> ({title}){" "}
          {isCompleted
            ? "was approved and completed. Do you want to delete it from your requests?"
            : `was ${status === "rejected" ? "rejected" : "cancelled"} rather than completed. Are you sure you want to delete it?`}
        </p>
      </ConfirmDialog>
    );
  }

  const matches = normalise(word) === "delete";

  return (
    <ConfirmDialog
      title="Type to confirm"
      confirmLabel="Delete request"
      busyLabel="Deleting…"
      tone="danger"
      canConfirm={matches}
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p className="mb-4">
        Deleting <span className="font-semibold text-ink">{reference}</span> removes it from your
        requests permanently — the approval record is kept for the institution&apos;s audit trail.
        To confirm, type <span className="font-semibold text-ink">delete</span> below.
      </p>

      <label
        className="mb-1.5 block text-[12.5px] font-medium text-muted"
        htmlFor="delete-request-word"
      >
        Type &ldquo;delete&rdquo;
      </label>
      <input
        ref={wordRef}
        id="delete-request-word"
        value={word}
        onChange={(e) => setWord(e.target.value)}
        disabled={busy}
        autoComplete="off"
        className="w-full rounded-control border border-line bg-surface px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-faint focus:outline-none disabled:text-faint"
        placeholder="delete"
      />

      {!matches && word !== "" && (
        <p className="mt-2 text-[12.5px] text-faint">
          Type the word &ldquo;delete&rdquo; exactly to enable the button.
        </p>
      )}
    </ConfirmDialog>
  );
}
