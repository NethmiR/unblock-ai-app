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

  /** The "Generate template" action. Slow - always show a loading state. */
  extract: (id: string) => apiRequest<ExtractResult>(`/drafts/${id}/extract`, { method: "POST" }),
};
