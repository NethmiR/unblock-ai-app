import { TemplateModel } from "../../models/template.model.js";
import { config } from "../../config/index.config.js";
import type { IVectorStore, VectorSearchOptions } from "../../lib/types/retrieval/retrieval.type.js";
import type { RetrievalCandidate } from "../../lib/types/selection/candidate.type.js";

export interface AtlasVectorStoreOptions {
  templateModel: TemplateModel;
  indexName?: string;
}

// $vectorSearch-backed retrieval. Implements the same interface as
// InMemoryVectorStore, so swapping it in is one line at the composition root.
export class AtlasVectorStore implements IVectorStore {
  private readonly templateModel: TemplateModel;
  private readonly indexName: string;

  constructor({ templateModel, indexName = config.retrieval.atlasIndexName }: AtlasVectorStoreOptions) {
    this.templateModel = templateModel;
    this.indexName = indexName;
  }

  async search(queryVector: number[], options: VectorSearchOptions = {}): Promise<RetrievalCandidate[]> {
    const k = options.k ?? 5;
    const rows = await this.templateModel.vectorSearch(queryVector, {
      k,
      institutionType: options.institutionType,
      indexName: this.indexName,
    });

    return rows.map((row) => ({
      workflow_id: row.workflow_id,
      version: row.version,
      title: row.title,
      description: row.description,
      score: row.score,
      aliases_lower: row.aliases_lower ?? [],
      retrieval_summary: row.retrieval_summary ?? null,
      retrieval_text: row.retrieval_text,
    }));
  }
}
