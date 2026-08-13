import { cosineSimilarity } from "../../utils/retrieval/vector-math.util.js";
import type { IVectorStore, ITemplateReader, VectorSearchOptions } from "../../lib/types/retrieval/retrieval.type.js";
import type { RetrievalCandidate } from "../../lib/types/selection/candidate.type.js";

export interface InMemoryVectorStoreOptions {
  templateReader: ITemplateReader;
}

// Exhaustive cosine search over every confirmed template. O(n * d) is well
// under a millisecond for n <= 200 templates at d = 1536.
export class InMemoryVectorStore implements IVectorStore {
  private readonly templateReader: ITemplateReader;

  constructor({ templateReader }: InMemoryVectorStoreOptions) {
    this.templateReader = templateReader;
  }

  async search(queryVector: number[], options: VectorSearchOptions = {}): Promise<RetrievalCandidate[]> {
    const k = options.k ?? 5;
    const rows = await this.templateReader.listForRetrieval({ institutionType: options.institutionType });

    return rows
      .map((row) => ({
        workflow_id: row.workflow_id,
        version: row.version,
        title: row.title,
        description: row.description,
        score: cosineSimilarity(queryVector, row.retrieval.embedding),
        aliases_lower: row.retrieval.aliases_lower ?? [],
        retrieval_summary: row.document?.retrieval_summary ?? null,
        retrieval_text: row.retrieval.text,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
