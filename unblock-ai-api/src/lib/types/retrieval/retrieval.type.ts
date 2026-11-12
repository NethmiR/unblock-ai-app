import type { RetrievalCandidate } from "../selection/candidate.type.js";
import type { WorkflowTemplateRetrievalProjection } from "../workflow-template/workflow-template.type.js";

export interface VectorSearchOptions {
  k?: number;
  institutionType?: string | null;
}

export interface IVectorStore {
  search(queryVector: number[], options?: VectorSearchOptions): Promise<RetrievalCandidate[]>;
}

export interface IWorkflowTemplateRetrievalReader {
  listForRetrieval(options: { institutionType?: string | null }): Promise<WorkflowTemplateRetrievalProjection[]>;
}

export interface EmbeddingMetadata {
  model: string;
  dim: number;
  embedded_at: string;
}
