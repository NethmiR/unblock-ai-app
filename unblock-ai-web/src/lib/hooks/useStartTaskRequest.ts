"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { revalidateApiPaths } from "@/lib/api/swr-cache";
import { TASKS_PATH, tasksApi } from "@/lib/api/tasks";
import { taskDetailPath } from "@/lib/routing/route-path";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { taskRequestErrorMessage } from "@/lib/task-request/task-error-message";
import type { CreateTaskRequest } from "@/types/task";

export interface StartTaskRequest {
  startingKey: string | null;
  error: { key: string; message: string } | null;
  start: (key: string, request: CreateTaskRequest) => Promise<void>;
}

export function useStartTaskRequest(): StartTaskRequest {
  const router = useRouter();
  const [startingKey, setStartingKey] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);

  const start = async (key: string, request: CreateTaskRequest) => {
      setStartingKey(key);
      setError(null);
      try {
        const task = await tasksApi.create(request);
        void revalidateApiPaths(TASKS_PATH);
        router.push(taskDetailPath(task.id));
      } catch (err) {
        setError({ key, message: taskRequestErrorMessage(err, TASK_REQUEST_COPY.assistant.startFailed) });
        setStartingKey(null);
      }
    };

  return { startingKey, error, start };
}
