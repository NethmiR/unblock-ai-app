"use client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { UI_COPY } from "@/lib/constants/ui-copy";
import type { UnsavedChangesGuard } from "@/lib/hooks/useUnsavedChangesGuard";

export function LeavePageDialog({ guard }: { guard: UnsavedChangesGuard }) {
  if (guard.pendingHref === null) return null;
  return (
    <ConfirmDialog
      title={UI_COPY.leaveTitle}
      confirmLabel={UI_COPY.leaveConfirm}
      cancelLabel={UI_COPY.stay}
      tone="danger"
      onConfirm={guard.confirmLeave}
      onCancel={guard.stay}
    >
      {UI_COPY.leaveBody}
    </ConfirmDialog>
  );
}
