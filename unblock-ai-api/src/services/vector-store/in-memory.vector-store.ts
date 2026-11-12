import { cosineSimilarity } from "../../utils/retrieval/vector-math.util.js";
import { toRetrievalCandidate } from "../../utils/retrieval/retrieval-candidate.util.js";
import type {
  IVectorStore,
  IWorkflowTemplateRetrievalReader,
  VectorSearchOptions,
} from "../../lib/types/retrieval/retrieval.type.js";
import type { RetrievalCandidate } from "../../lib/types/selection/candidate.type.js";

export interface InMemoryVectorStoreOptions {
  retrievalReader: IWorkflowTemplateRetrievalReader;
}

export class InMemoryVectorStore implements IVectorStore {
  private readonly retrievalReader: IWorkflowTemplateRetrievalReader;

  constructor({ retrievalReader }: InMemoryVectorStoreOptions) {
    this.retrievalReader = retrievalReader;
  }

  async search(queryVector: number[], options: VectorSearchOptions = {}): Promise<RetrievalCandidate[]> {
    const rows = await this.retrievalReader.listForRetrieval({ institutionType: options.institutionType });
    return rows
      .map((row) => toRetrievalCandidate(row, cosineSimilarity(queryVector, row.retrieval.embedding)))
      .sort((a, b) => b.score - a.score)
      .slice(0, options.k ?? 5);
  }
}
