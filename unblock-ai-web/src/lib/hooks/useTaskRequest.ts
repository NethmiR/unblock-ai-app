"use client";
import useSWR, { type SWRResponse } from "swr";
import { fetcher } from "@/lib/api/client";
import { taskPath, taskWorkflowDefinitionPath } from "@/lib/api/tasks";
import { hasStepAwaitingApprover } from "@/lib/task-request/task-progress";
import { TASK_REQUEST_POLL_INTERVAL_MS } from "@/lib/task-request/task-request-constant";
import type { TaskDto, TaskWorkflowDefinitionDto } from "@/types/task";

function pollInterval(task: TaskDto | undefined): number {
  return task !== undefined && hasStepAwaitingApprover(task) ? TASK_REQUEST_POLL_INTERVAL_MS : 0;
}

export function useTaskRequest(taskId: string): SWRResponse<TaskDto, unknown> {
  return useSWR<TaskDto>(taskPath(taskId), fetcher, { refreshInterval: pollInterval });
}

export function useTaskWorkflowDefinition(taskId: string | null): SWRResponse<TaskWorkflowDefinitionDto, unknown> {
  return useSWR<TaskWorkflowDefinitionDto>(taskId === null ? null : taskWorkflowDefinitionPath(taskId), fetcher, {
    revalidateOnFocus: false,
  });
}
