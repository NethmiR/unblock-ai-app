"use client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TaskRequestAction, type TaskRequestActions } from "@/lib/hooks/useTaskRequestActions";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";

const COPY = TASK_REQUEST_COPY.actions;

export function TaskRequestActionDialog({ actions }: { actions: TaskRequestActions }) {
  const pending = actions.pending;
  if (pending === null) return null;
  const isCancel = pending.action === TaskRequestAction.CANCEL;

  return (
    <ConfirmDialog
      title={isCancel ? COPY.cancelTitle(pending.target.title) : COPY.deleteTitle(pending.target.title)}
      confirmLabel={isCancel ? COPY.cancelConfirm : COPY.deleteConfirm}
      cancelLabel={isCancel ? COPY.cancelKeep : undefined}
      busyLabel={isCancel ? COPY.cancelBusy : COPY.deleteBusy}
      tone="danger"
      busy={actions.busy}
      error={actions.error}
      onConfirm={() => void actions.confirm()}
      onCancel={actions.dismiss}
    >
      {isCancel ? COPY.cancelBody : COPY.deleteBody}
    </ConfirmDialog>
  );
}
