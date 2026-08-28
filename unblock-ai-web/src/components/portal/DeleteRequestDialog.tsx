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
 * WORDING is what varies, because the three deletable shapes of a request are
 * three different things to lose: an approved one is finished business being
 * cleared away, a rejected or cancelled one never finished, and one still
 * collecting details was never sent to anybody at all. Both paths end at the
 * same type-to-confirm step - the word, and only the word, per the portal's
 * simpler bar than the admin's word-plus-title.
 */
type Stage = "confirm-intent" | "type-to-confirm";

/** What the reader is about to lose, which is what the copy is written around. */
type Kind = "approved" | "unsent" | "unfinished";

/**
 * `collecting` only ever reaches this dialog when nothing has been dispatched -
 * `isDeletable` is what lets it through - so the status alone names the kind.
 */
function kindOf(status: TaskStatus): Kind {
  if (status === "completed") return "approved";
  if (status === "collecting") return "unsent";
  return "unfinished";
}

/** Case- and whitespace-insensitive, mirroring the admin dialog's comparison. */
const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

/** First-stage copy as data, not as a conditional chain. */
const INTENT_TITLE: Record<Kind, string> = {
  approved: "This request is already approved",
  unsent: "This request has not been sent yet",
  unfinished: "This request was never completed",
};

/**
 * `unfinished` is absent on purpose - its sentence names the status that ended
 * it, so it is built at the call site rather than frozen here.
 */
const INTENT_BODY: Record<"approved" | "unsent", string> = {
  approved:
    "was approved and completed. A PDF record was emailed to you when it completed - that copy is yours to keep, so deleting it here only removes the download from your requests. Do you want to delete it?",
  unsent:
    "has not gone to anyone for approval yet. Deleting it now discards the details you have entered so far. Are you sure?",
};

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
  /** Only deletable statuses reach here; each kind gets its own first-stage wording. */
  status: TaskStatus;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const kind = kindOf(status);
  const [stage, setStage] = useState<Stage>("confirm-intent");
  const [word, setWord] = useState("");
  const wordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === "type-to-confirm") wordRef.current?.focus();
  }, [stage]);

  if (stage === "confirm-intent") {
    return (
      <ConfirmDialog
        title={INTENT_TITLE[kind]}
        confirmLabel="Yes, delete it"
        cancelLabel="No, keep it"
        tone="danger"
        onConfirm={() => setStage("type-to-confirm")}
        onCancel={onCancel}
      >
        <p>
          <span className="font-semibold text-ink">{reference}</span> ({title}){" "}
          {kind === "unfinished"
            ? `was ${status === "rejected" ? "rejected" : "cancelled"} rather than completed. Are you sure you want to delete it?`
            : INTENT_BODY[kind]}
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
        requests permanently —{" "}
        {kind === "unsent"
          ? "the details you have entered so far go with it, and nothing was ever sent for approval."
          : "the approval record is kept for the institution’s audit trail."}{" "}
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
