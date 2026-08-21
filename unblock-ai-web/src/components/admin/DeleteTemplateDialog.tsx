"use client";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * Step one asks whether the admin means it; step two makes them prove they
 * know WHICH template they are deleting. Both are re-checked by the API, so
 * neither is decorative.
 */
type Stage = "confirm" | "type-to-confirm";

/** Case- and whitespace-insensitive, mirroring the server's own comparison. */
const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

export function DeleteTemplateDialog({
  title,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  busy: boolean;
  error: string | null;
  /** Receives exactly what the admin typed - the API validates it again. */
  onConfirm: (confirmation: string, confirmTitle: string) => void;
  onCancel: () => void;
}) {
  const [stage, setStage] = useState<Stage>("confirm");
  const [word, setWord] = useState("");
  const [typedTitle, setTypedTitle] = useState("");
  const wordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === "type-to-confirm") wordRef.current?.focus();
  }, [stage]);

  if (stage === "confirm") {
    return (
      <ConfirmDialog
        title="Delete this template?"
        confirmLabel="Yes, delete"
        cancelLabel="No, keep it"
        tone="danger"
        onConfirm={() => setStage("type-to-confirm")}
        onCancel={onCancel}
      >
        <p>
          <span className="font-semibold text-ink">{title}</span> and every saved version of it
          will be removed permanently. This cannot be undone.
        </p>
      </ConfirmDialog>
    );
  }

  const matches = normalise(word) === "delete" && normalise(typedTitle) === normalise(title);

  return (
    <ConfirmDialog
      title="Type to confirm"
      confirmLabel="Delete template"
      busyLabel="Deleting…"
      tone="danger"
      canConfirm={matches}
      busy={busy}
      error={error}
      onConfirm={() => onConfirm(word, typedTitle)}
      onCancel={onCancel}
    >
      <p className="mb-4">
        To confirm, type <span className="font-semibold text-ink">delete</span> and then the
        template&apos;s name.
      </p>

      <label className="mb-1.5 block text-[12.5px] font-medium text-muted" htmlFor="delete-word">
        Type &ldquo;delete&rdquo;
      </label>
      <input
        ref={wordRef}
        id="delete-word"
        value={word}
        onChange={(e) => setWord(e.target.value)}
        disabled={busy}
        autoComplete="off"
        className="mb-4 w-full rounded-control border border-line-admin bg-surface px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-faint focus:outline-none disabled:text-faint"
        placeholder="delete"
      />

      <label className="mb-1.5 block text-[12.5px] font-medium text-muted" htmlFor="delete-title">
        Type the template name
      </label>
      <input
        id="delete-title"
        value={typedTitle}
        onChange={(e) => setTypedTitle(e.target.value)}
        disabled={busy}
        autoComplete="off"
        className="w-full rounded-control border border-line-admin bg-surface px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-faint focus:outline-none disabled:text-faint"
        placeholder={title}
      />

      {!matches && (word !== "" || typedTitle !== "") && (
        <p className="mt-2 text-[12.5px] text-faint">
          Both fields must match before this template can be deleted.
        </p>
      )}
    </ConfirmDialog>
  );
}
