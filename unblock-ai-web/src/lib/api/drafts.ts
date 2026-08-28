import { apiRequest } from "./client";
import type { Draft } from "@/types/draft";
import type { ReviewStatus, Workflow } from "@/types/workflow";

export interface ExtractResult {
  draft_id: string;
  workflow_id: string;
  version: number;
  attempts: number;
  review_status: ReviewStatus;
  workflow: Workflow;
}

export const draftsApi = {
  create: (text: string, title?: string) =>
    apiRequest<Draft>("/drafts", { method: "POST", body: { text, title } }),

  get: (id: string) => apiRequest<Draft>(`/drafts/${id}`),

  list: () => apiRequest<Draft[]>("/drafts"),

  /**
   * The "Generate template" action. Slow - always show a loading state.
   *
   * `title` overrides the one the model infers from the prose. The editor
   * always sends the title on screen: without it every regeneration re-invents
   * a title and silently reverts a rename the admin made earlier.
   */
  extract: (id: string, title?: string) =>
    apiRequest<ExtractResult>(`/drafts/${id}/extract`, {
      method: "POST",
      body: title ? { title } : {},
    }),
};
