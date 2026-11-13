import type { ObjectId } from "mongodb";
import type {
  WorkflowTemplateStatus,
  WorkflowTemplateVisibility,
} from "../../../data/constants/workflow-template.constant.js";
import type { RetrievalSummary } from "../workflow/retrieval-summary.type.js";
import type { WorkflowStep } from "../workflow/step.type.js";
import type { WorkflowDefinition, WorkflowScope, WorkflowScopeAppliesTo } from "../workflow/workflow.type.js";
import type { UserReference, UserReferenceDto } from "../user/user.type.js";

export interface WorkflowTemplateListOptions {
  includeArchived: boolean;
  visibility: WorkflowTemplateVisibility;
}

export type StoredWorkflowDefinition = Omit<WorkflowDefinition, "title">;

export type StoredWorkflowStepInput = Omit<WorkflowStep, "collects_inputs"> & { collects_inputs?: string[] };

export type StoredWorkflowScopeInput = Omit<WorkflowScope, "applies_to"> & {
  applies_to: Omit<WorkflowScopeAppliesTo, "organisational_unit_codes"> & { organisational_unit_codes?: string[] };
};

export type StoredWorkflowDefinitionInput = Omit<StoredWorkflowDefinition, "scope" | "steps"> & {
  scope: StoredWorkflowScopeInput;
  steps: StoredWorkflowStepInput[];
};

export interface WorkflowTemplateRetrieval {
  text: string;
  embedding: number[];
  aliases_lower: string[];
  retrieval_summary: RetrievalSummary;
  institution_type: string;
  model: string;
  dim: number;
  embedded_at: string;
}

export interface WorkflowTemplateDocument {
  _id: string;
  title: string;
  description: string | null;
  status: WorkflowTemplateStatus;
  draft_prompt: string | null;
  current_version: number | null;
  retrieval: WorkflowTemplateRetrieval | null;
  created_by: string;
  updated_by: string;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface WorkflowTemplateVersionDocument {
  _id: ObjectId;
  workflow_template_id: string;
  version: number;
  prompt: string;
  definition: StoredWorkflowDefinition;
  generation_attempts: number;
  created_by: string;
  created_at: Date;
}

export interface StoredWorkflowTemplateVersionDocument extends Omit<WorkflowTemplateVersionDocument, "definition"> {
  definition: StoredWorkflowDefinitionInput;
}

export type WorkflowTemplateVersionSummaryDocument = Omit<WorkflowTemplateVersionDocument, "prompt" | "definition">;

export interface WorkflowTemplateRetrievalProjection {
  _id: string;
  title: string;
  description: string | null;
  current_version: number;
  retrieval: WorkflowTemplateRetrieval;
}

export interface WorkflowTemplateCatalogueProjection {
  _id: string;
  title: string;
  current_version: number;
}

export interface WorkflowTemplateVersionKey {
  workflow_template_id: string;
  version: number;
}

export interface WorkflowTemplateVectorSearchRow extends WorkflowTemplateRetrievalProjection {
  score: number;
}

export interface GeneratedWorkflowTemplate {
  title: string;
  definition: StoredWorkflowDefinition;
  attempts: number;
}

export type UserReferenceLookup = ReadonlyMap<string, UserReference>;

export interface WorkflowTemplateList {
  templates: WorkflowTemplateDocument[];
  users: UserReferenceLookup;
}

export interface WorkflowTemplateDetail {
  template: WorkflowTemplateDocument;
  currentVersion: WorkflowTemplateVersionDocument | null;
  users: UserReferenceLookup;
}

export interface WorkflowTemplateVersionList {
  versions: WorkflowTemplateVersionSummaryDocument[];
  users: UserReferenceLookup;
}

export interface WorkflowTemplateVersionDetail {
  version: WorkflowTemplateVersionDocument;
  users: UserReferenceLookup;
}

export interface PublishedWorkflowDefinition {
  version: number;
  definition: WorkflowDefinition;
}

export interface CreateWorkflowTemplateDraftInput {
  title: string;
  prompt: string;
}

export interface GenerateWorkflowTemplateInput {
  title: string | null;
  prompt: string;
}

export interface UpdateWorkflowTemplateInput {
  title?: string;
  draftPrompt?: string | null;
}

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
  definition: StoredWorkflowDefinition;
}

export interface WorkflowTemplateDto extends WorkflowTemplateSummaryDto {
  draft_prompt: string | null;
  current: WorkflowTemplateVersionDto | null;
}
