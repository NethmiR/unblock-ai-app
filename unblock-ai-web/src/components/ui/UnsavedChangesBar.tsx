"use client";
import { Button } from "@/components/ui/Button";
import { UI_COPY } from "@/lib/constants/ui-copy";

interface UnsavedChangesBarProps {
  busy: boolean;
  onDiscard: () => void;
  onSave: () => void;
  message?: string;
}

export function UnsavedChangesBar({ busy, onDiscard, onSave, message = UI_COPY.unsavedChanges }: UnsavedChangesBarProps) {
  return (
    <div
      role="region"
      aria-label={message}
      className="sticky bottom-0 z-20 -mx-4 mt-6 flex flex-col gap-3 border-t border-line-admin bg-surface/95 px-4 py-3.5 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <span className="flex items-center gap-2 text-[13px] font-semibold text-warn-ink">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warn" />
        {message}
      </span>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onDiscard} disabled={busy}>
          {UI_COPY.discard}
        </Button>
        <Button size="sm" onClick={onSave} disabled={busy}>
          {busy ? UI_COPY.saving : UI_COPY.save}
        </Button>
      </div>
    </div>
  );
}
