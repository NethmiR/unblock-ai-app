import type { ObjectId } from "mongodb";
import type { RetrievalSummary } from "../workflow/retrieval-summary.type.js";
import type { ReviewStatus, WorkflowDefinition } from "../workflow/workflow.type.js";

export interface TemplateRetrieval {
  text: string;
  embedding: number[];
  aliases_lower: string[];
  model: string;
  dim: number;
  embedded_at: string;
}

export interface TemplateDocument {
  _id: ObjectId;
  workflow_id: string;
  version: number;
  draft_id: ObjectId | null;
  title: string;
  description: string;
  institution_type: string | null;
  schema_version: string;
  review_status: ReviewStatus;
  document: WorkflowDefinition;
  is_latest: boolean;
  retrieval: TemplateRetrieval;
  created_at: Date;
  updated_at: Date;
}

export interface TemplateSummary {
  workflow_id: string;
  title: string;
  description: string;
  version: number;
  schema_version: string;
  review_status: ReviewStatus;
  draft_id: string | null;
  updated_at: string;
}

export interface TemplateRecordDto {
  workflow_id: string;
  version: number;
  draft_id: string | null;
  review_status: ReviewStatus;
  document: WorkflowDefinition;
  updated_at: Date;
}

export interface RetrievalProjection {
  workflow_id: string;
  version: number;
  title: string;
  description: string;
  retrieval: Pick<TemplateRetrieval, "embedding" | "aliases_lower" | "text">;
  document: { retrieval_summary: RetrievalSummary };
}

export interface SaveResult {
  id: string;
  version: number;
}
