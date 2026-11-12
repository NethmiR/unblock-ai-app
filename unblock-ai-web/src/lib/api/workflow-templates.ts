import { apiRequest } from "./client";
import { withQuery } from "./query-string";
import type {
  CreateWorkflowTemplateDraftRequest,
  GenerateWorkflowTemplateRequest,
  UpdateWorkflowTemplateRequest,
  WorkflowTemplateListResponse,
  WorkflowTemplateResponse,
  WorkflowTemplateVersionListResponse,
  WorkflowTemplateVersionResponse,
} from "@/types/workflow-template";

export const WORKFLOW_TEMPLATES_PATH = "/workflow-templates";

export function workflowTemplateListPath(includeArchived: boolean): string {
  return withQuery(WORKFLOW_TEMPLATES_PATH, { include_archived: includeArchived });
}

export function workflowTemplatePath(workflowTemplateId: string): string {
  return `${WORKFLOW_TEMPLATES_PATH}/${encodeURIComponent(workflowTemplateId)}`;
}

export function workflowTemplateVersionsPath(workflowTemplateId: string): string {
  return `${workflowTemplatePath(workflowTemplateId)}/versions`;
}

export function workflowTemplateVersionPath(workflowTemplateId: string, version: number): string {
  return `${workflowTemplateVersionsPath(workflowTemplateId)}/${version}`;
}

function postAction(workflowTemplateId: string, action: string, body?: unknown): Promise<WorkflowTemplateResponse> {
  return apiRequest<WorkflowTemplateResponse>(`${workflowTemplatePath(workflowTemplateId)}/${action}`, { method: "POST", body });
}

export const workflowTemplatesApi = {
  list: (includeArchived: boolean) => apiRequest<WorkflowTemplateListResponse>(workflowTemplateListPath(includeArchived)),

  get: (workflowTemplateId: string) => apiRequest<WorkflowTemplateResponse>(workflowTemplatePath(workflowTemplateId)),

  listVersions: (workflowTemplateId: string) =>
    apiRequest<WorkflowTemplateVersionListResponse>(workflowTemplateVersionsPath(workflowTemplateId)),

  getVersion: (workflowTemplateId: string, version: number) =>
    apiRequest<WorkflowTemplateVersionResponse>(workflowTemplateVersionPath(workflowTemplateId, version)),

  createDraft: (body: CreateWorkflowTemplateDraftRequest) =>
    apiRequest<WorkflowTemplateResponse>(WORKFLOW_TEMPLATES_PATH, { method: "POST", body }),

  generate: (body: GenerateWorkflowTemplateRequest) =>
    apiRequest<WorkflowTemplateResponse>(`${WORKFLOW_TEMPLATES_PATH}/generate`, { method: "POST", body }),

  update: (workflowTemplateId: string, body: UpdateWorkflowTemplateRequest) =>
    apiRequest<WorkflowTemplateResponse>(workflowTemplatePath(workflowTemplateId), { method: "PATCH", body }),

  regenerate: (workflowTemplateId: string, body: GenerateWorkflowTemplateRequest) => postAction(workflowTemplateId, "generate", body),

  publish: (workflowTemplateId: string) => postAction(workflowTemplateId, "publish"),

  archive: (workflowTemplateId: string) => postAction(workflowTemplateId, "archive"),

  restore: (workflowTemplateId: string) => postAction(workflowTemplateId, "restore"),
};
