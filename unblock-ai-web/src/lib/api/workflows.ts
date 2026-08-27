import { apiRequest } from "./client";
import type {
  InstitutionType,
  Workflow,
  WorkflowSummary,
  WorkflowRecord,
  ReviewStatus,
  TemplateDeletion,
} from "@/types/workflow";

/** `POST /workflows/extract` - compiles text WITHOUT persisting anything. */
export interface WorkflowExtractResult {
  workflow: Workflow;
  validation: ValidationResult;
  attempts: number;
}

/** `POST /workflows/:id/validate` - always `200`, even when invalid. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** What `POST /workflows` and `PUT /workflows/:id` return - NOT the document. */
export interface SaveResult {
  id: string;
  version: number;
}

export const workflowsApi = {
  list: (institutionType?: InstitutionType) =>
    apiRequest<WorkflowSummary[]>(
      `/workflows${institutionType ? `?institution_type=${institutionType}` : ""}`,
    ),

  get: (id: string, version?: number) =>
    apiRequest<Workflow>(`/workflows/${id}${version !== undefined ? `?version=${version}` : ""}`),

  /** The full stored row, including `draft_id` - used by the admin editor. */
  getRecord: (id: string, version?: number) =>
    apiRequest<WorkflowRecord>(`/workflows/${id}/record${version !== undefined ? `?version=${version}` : ""}`),

  setReviewStatus: (id: string, reviewStatus: ReviewStatus, version?: number) =>
    apiRequest<WorkflowSummary>(`/workflows/${id}/review`, {
      method: "PATCH",
      body: { review_status: reviewStatus, version },
    }),

  /**
   * Preview compilation with no side effects - nothing is written to the
   * database. The draft-then-extract flow is still the one to use when the
   * raw prose must survive a failed extraction.
   */
  extract: (text: string) =>
    apiRequest<WorkflowExtractResult>("/workflows/extract", { method: "POST", body: { text } }),

  /** Rejects with a 422 VALIDATION_ERROR if the document fails the schema. */
  create: (workflow: Workflow) =>
    apiRequest<SaveResult>("/workflows", { method: "POST", body: { workflow } }),

  /** Full-document replace. Creates a NEW version rather than mutating one. */
  update: (id: string, workflow: Workflow) =>
    apiRequest<SaveResult>(`/workflows/${id}`, { method: "PUT", body: { workflow } }),

  /**
   * Permanent, and irreversible: removes EVERY version of the workflow.
   *
   * `confirmation` must be the word "delete" and `confirmTitle` must match the
   * template's title - the API re-checks both, so the two-step dialog in the
   * admin UI is a real guard rather than a decoration.
   */
  remove: (id: string, confirmation: string, confirmTitle: string) =>
    apiRequest<void>(`/workflows/${id}`, {
      method: "DELETE",
      body: { confirmation, confirm_title: confirmTitle },
    }),

  /**
   * Checks a document without saving it. Unlike `create`/`update` this never
   * throws on an invalid document - it resolves with `{ valid: false, errors }`.
   */
  validate: (id: string, workflow: Workflow) =>
    apiRequest<ValidationResult>(`/workflows/${id}/validate`, { method: "POST", body: { workflow } }),

  /** `GET /workflows/deletions` (admin-only) - the template deletion log, newest first. */
  listDeletions: (limit?: number) =>
    apiRequest<TemplateDeletion[]>(`/workflows/deletions${limit ? `?limit=${limit}` : ""}`),
};
