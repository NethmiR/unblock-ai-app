import type { UserReferenceDto } from "./user";
import type { Workflow } from "./workflow";

export enum WorkflowTemplateStatus {
  DRAFT = "draft",
  UNPUBLISHED = "unpublished",
  PUBLISHED = "published",
}

export enum WorkflowTemplateErrorCode {
  WORKFLOW_TEMPLATE_NOT_FOUND = "WORKFLOW_TEMPLATE_NOT_FOUND",
  WORKFLOW_TEMPLATE_VERSION_NOT_FOUND = "WORKFLOW_TEMPLATE_VERSION_NOT_FOUND",
  WORKFLOW_TEMPLATE_ARCHIVED = "WORKFLOW_TEMPLATE_ARCHIVED",
  WORKFLOW_TEMPLATE_NOT_ARCHIVED = "WORKFLOW_TEMPLATE_NOT_ARCHIVED",
  WORKFLOW_TEMPLATE_NOT_GENERATED = "WORKFLOW_TEMPLATE_NOT_GENERATED",
  WORKFLOW_TEMPLATE_ALREADY_PUBLISHED = "WORKFLOW_TEMPLATE_ALREADY_PUBLISHED",
  WORKFLOW_TEMPLATE_NOT_PUBLISHED = "WORKFLOW_TEMPLATE_NOT_PUBLISHED",
  WORKFLOW_TEMPLATE_GENERATION_FAILED = "WORKFLOW_TEMPLATE_GENERATION_FAILED",
  WORKFLOW_TEMPLATE_PROMPT_REJECTED = "WORKFLOW_TEMPLATE_PROMPT_REJECTED",
  WORKFLOW_TEMPLATE_NOT_ELIGIBLE = "WORKFLOW_TEMPLATE_NOT_ELIGIBLE",
}

export type WorkflowTemplateDefinition = Omit<Workflow, "title">;

export interface WorkflowTemplateSummaryDto {
  id: string;
  title: string;
  description: string | null;
  status: WorkflowTemplateStatus;
  current_version: number | null;
  has_ungenerated_changes: boolean;
  is_archived: boolean;
  archived_at: string | null;
  created_by: UserReferenceDto | null;
  updated_by: UserReferenceDto | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowTemplateVersionSummaryDto {
  version: number;
  generation_attempts: number;
  created_by: UserReferenceDto | null;
  created_at: string;
}

export interface WorkflowTemplateVersionDto extends WorkflowTemplateVersionSummaryDto {
  prompt: string;
  definition: WorkflowTemplateDefinition;
}

export interface WorkflowTemplateDto extends WorkflowTemplateSummaryDto {
  draft_prompt: string | null;
  current: WorkflowTemplateVersionDto | null;
}

export interface WorkflowTemplateListResponse {
  workflow_templates: WorkflowTemplateSummaryDto[];
}

export interface WorkflowTemplateResponse {
  workflow_template: WorkflowTemplateDto;
}

export interface WorkflowTemplateVersionListResponse {
  versions: WorkflowTemplateVersionSummaryDto[];
}

export interface WorkflowTemplateVersionResponse {
  version: WorkflowTemplateVersionDto;
}

export interface CreateWorkflowTemplateDraftRequest {
  title: string;
  prompt: string;
}

export interface GenerateWorkflowTemplateRequest {
  title?: string;
  prompt: string;
}

export interface UpdateWorkflowTemplateRequest {
  title?: string;
  draft_prompt?: string | null;
}

export interface MatchedWorkflowTemplateResponse {
  workflow_template_version: number;
  definition: Workflow;
}
