import { apiRequest } from "./client";
import type { NextRequirementDto, RequirementValue, TaskDto, TaskStatus } from "@/types/task";
import type { TaskStatusDto } from "@/types/approval";

export const tasksApi = {
  create: (sessionId: string) =>
    apiRequest<TaskDto>("/tasks", { method: "POST", body: { session_id: sessionId } }),

  list: (filters: { session_id?: string; status?: TaskStatus } = {}) => {
    const params = new URLSearchParams();
    if (filters.session_id) params.set("session_id", filters.session_id);
    if (filters.status) params.set("status", filters.status);
    const qs = params.toString();
    return apiRequest<TaskDto[]>(`/tasks${qs ? `?${qs}` : ""}`);
  },

  get: (id: string) => apiRequest<TaskDto>(`/tasks/${id}`),

  next: (id: string) => apiRequest<NextRequirementDto>(`/tasks/${id}/next`),

  setValue: (id: string, key: string, value: RequirementValue) =>
    apiRequest<TaskDto>(`/tasks/${id}/values`, { method: "POST", body: { key, value } }),

  /** Sends no body - `apiRequest` only sets one when truthy, which is correct here. */
  finalize: (id: string) => apiRequest<TaskDto>(`/tasks/${id}/finalize`, { method: "POST" }),

  /** Sends no body. Dispatches approval emails - not safe to call speculatively. */
  start: (id: string) => apiRequest<TaskDto>(`/tasks/${id}/start`, { method: "POST" }),

  status: (id: string) => apiRequest<TaskStatusDto>(`/tasks/${id}/status`),

  /** The only accepted `PATCH /tasks/:id/status` transition - the controller 400s on any other value. */
  cancel: (id: string) =>
    apiRequest<TaskDto>(`/tasks/${id}/status`, {
      method: "PATCH",
      body: { status: "cancelled" },
    }),
};
