import { apiBlob, apiRequest } from "./client";
import { withQuery } from "./query-string";
import type { CreateTaskRequest, TaskDto, TaskListQuery, TaskWorkflowDefinitionDto } from "@/types/task";
import type { TaskFieldValueDto, TaskFormValuesRequest } from "@/types/task-form";

export const TASKS_PATH = "/tasks";

export function taskListPath(query: TaskListQuery): string {
  return withQuery(TASKS_PATH, query);
}

export function taskPath(taskId: string): string {
  return `${TASKS_PATH}/${encodeURIComponent(taskId)}`;
}

export function taskWorkflowDefinitionPath(taskId: string): string {
  return `${taskPath(taskId)}/workflow-definition`;
}

function taskFormPath(taskId: string, formId: string): string {
  return `${taskPath(taskId)}/forms/${encodeURIComponent(formId)}`;
}

export const tasksApi = {
  create: (body: CreateTaskRequest) => apiRequest<TaskDto>(TASKS_PATH, { method: "POST", body }),

  get: (taskId: string) => apiRequest<TaskDto>(taskPath(taskId)),

  getWorkflowDefinition: (taskId: string) => apiRequest<TaskWorkflowDefinitionDto>(taskWorkflowDefinitionPath(taskId)),

  saveDraft: (taskId: string, formId: string, values: Record<string, TaskFieldValueDto>) => {
    const body: TaskFormValuesRequest = { values };
    return apiRequest<TaskDto>(`${taskFormPath(taskId, formId)}/draft`, { method: "PUT", body });
  },

  submitForm: (taskId: string, formId: string, values: Record<string, TaskFieldValueDto>) => {
    const body: TaskFormValuesRequest = { values };
    return apiRequest<TaskDto>(`${taskFormPath(taskId, formId)}/submit`, { method: "POST", body });
  },

  cancel: (taskId: string) => apiRequest<TaskDto>(`${taskPath(taskId)}/cancel`, { method: "POST" }),

  remove: (taskId: string) => apiRequest<void>(taskPath(taskId), { method: "DELETE" }),

  transcript: (taskId: string) => apiBlob(`${taskPath(taskId)}/transcript`),
};
