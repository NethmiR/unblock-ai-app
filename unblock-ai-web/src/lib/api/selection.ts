import { apiRequest } from "./client";
import type { SelectionChooseRequest, SelectionMessageRequest, SelectionSessionDto } from "@/types/selection";

export const SELECTION_SESSIONS_PATH = "/selection/sessions";

export function selectionSessionPath(sessionId: string): string {
  return `${SELECTION_SESSIONS_PATH}/${encodeURIComponent(sessionId)}`;
}

export function selectionCataloguePath(): string {
  return "/selection/catalogue";
}

export const selectionApi = {
  start: (message: string) => {
    const body: SelectionMessageRequest = { message };
    return apiRequest<SelectionSessionDto>(SELECTION_SESSIONS_PATH, { method: "POST", body });
  },

  get: (sessionId: string) => apiRequest<SelectionSessionDto>(selectionSessionPath(sessionId)),

  sendMessage: (sessionId: string, message: string) => {
    const body: SelectionMessageRequest = { message };
    return apiRequest<SelectionSessionDto>(`${selectionSessionPath(sessionId)}/messages`, { method: "POST", body });
  },

  choose: (sessionId: string, workflowTemplateId: string) => {
    const body: SelectionChooseRequest = { workflow_template_id: workflowTemplateId };
    return apiRequest<SelectionSessionDto>(`${selectionSessionPath(sessionId)}/choose`, { method: "POST", body });
  },

  discard: (sessionId: string) => apiRequest<void>(selectionSessionPath(sessionId), { method: "DELETE" }),
};
