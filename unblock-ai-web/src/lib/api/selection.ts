import { apiRequest } from "./client";
import type { ChooseResponse, SelectionResponse } from "@/types/selection";
import type { InstitutionType, Workflow } from "@/types/workflow";
import type { MatchedWorkflowTemplateResponse } from "@/types/workflow-template";

export const selectionApi = {
  start: (query: string, requesterContext?: Record<string, unknown>, institutionType?: InstitutionType) =>
    apiRequest<SelectionResponse>("/selection/sessions", {
      method: "POST",
      body: { query, requester_context: requesterContext, institution_type: institutionType },
    }),

  answer: (sessionId: string, answer: string) =>
    apiRequest<SelectionResponse>(`/selection/sessions/${sessionId}/answer`, {
      method: "POST",
      body: { answer },
    }),

  choose: (sessionId: string, workflowTemplateId: string) =>
    apiRequest<ChooseResponse>(`/selection/sessions/${sessionId}/choose`, {
      method: "POST",
      body: { workflow_template_id: workflowTemplateId },
    }),

  getWorkflowTemplate: (sessionId: string): Promise<Workflow> =>
    apiRequest<MatchedWorkflowTemplateResponse>(`/selection/sessions/${sessionId}/workflow-template`).then(
      (response) => response.definition,
    ),
};
