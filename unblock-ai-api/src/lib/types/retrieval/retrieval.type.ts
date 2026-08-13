import type { RetrievalCandidate } from "../selection/candidate.type.js";
import type { RetrievalProjection } from "../template/template.type.js";

export interface VectorSearchOptions {
  k?: number;
  institutionType?: string | null;
}

export interface IVectorStore {
  search(queryVector: number[], options?: VectorSearchOptions): Promise<RetrievalCandidate[]>;
}

export interface ITemplateReader {
  listForRetrieval(options: { institutionType?: string | null }): Promise<RetrievalProjection[]>;
}

export interface EmbeddingMetadata {
  model: string;
  dim: number;
  embedded_at: string;
}
