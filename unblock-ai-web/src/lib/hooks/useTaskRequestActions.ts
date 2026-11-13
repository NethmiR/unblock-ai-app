"use client";
import { useState } from "react";
import { mutate } from "swr";
import { useToast } from "@/components/providers/ToastProvider";
import { revalidateApiPaths } from "@/lib/api/swr-cache";
import { TASKS_PATH, taskPath, tasksApi } from "@/lib/api/tasks";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { taskRequestErrorMessage } from "@/lib/task-request/task-error-message";
import { saveBlob } from "@/lib/utils/download";
import type { TaskSummaryDto } from "@/types/task";

const COPY = TASK_REQUEST_COPY.actions;

export enum TaskRequestAction {
  CANCEL = "cancel",
  DELETE = "delete",
}

export type TaskRequestActionTarget = Pick<TaskSummaryDto, "id" | "title">;

export interface PendingTaskRequestAction {
  action: TaskRequestAction;
  target: TaskRequestActionTarget;
}

export interface TaskRequestActions {
  pending: PendingTaskRequestAction | null;
  busy: boolean;
  error: string | null;
  downloadingId: string | null;
  request: (action: TaskRequestAction, target: TaskRequestActionTarget) => void;
  dismiss: () => void;
  confirm: () => Promise<void>;
  downloadTranscript: (target: TaskRequestActionTarget) => Promise<void>;
}

export function useTaskRequestActions(onDeleted?: (target: TaskRequestActionTarget) => void): TaskRequestActions {
  const toast = useToast();
  const [pending, setPending] = useState<PendingTaskRequestAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const request = (action: TaskRequestAction, target: TaskRequestActionTarget) => {
    setError(null);
    setPending({ action, target });
  };

  const dismiss = () => {
    if (!busy) setPending(null);
  };

  const confirm = async () => {
    if (pending === null) return;
    const { action, target } = pending;
    setBusy(true);
    setError(null);
    try {
      switch (action) {
        case TaskRequestAction.CANCEL: {
          const updated = await tasksApi.cancel(target.id);
          await mutate(taskPath(target.id), updated, { revalidate: false });
          toast.success(COPY.cancelled);
          break;
        }
        case TaskRequestAction.DELETE:
          await tasksApi.remove(target.id);
          toast.success(COPY.deleted);
          onDeleted?.(target);
          break;
        default: {
          const unreachable: never = action;
          return unreachable;
        }
      }
      setPending(null);
      void revalidateApiPaths(`${TASKS_PATH}?`);
    } catch (err) {
      setError(taskRequestErrorMessage(err, action === TaskRequestAction.CANCEL ? COPY.cancelFailed : COPY.deleteFailed));
    } finally {
      setBusy(false);
    }
  };

  const downloadTranscript = async (target: TaskRequestActionTarget) => {
      setDownloadingId(target.id);
      try {
        const { blob, filename } = await tasksApi.transcript(target.id);
        saveBlob(blob, filename);
      } catch (err) {
        toast.error(taskRequestErrorMessage(err, COPY.transcriptFailed));
      } finally {
        setDownloadingId(null);
      }
    };

  return { pending, busy, error, downloadingId, request, dismiss, confirm, downloadTranscript };
}
