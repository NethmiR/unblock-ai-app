import { WorkflowTemplateModel } from "../../models/workflow-template.model.js";
import { config } from "../../config/index.config.js";
import { toRetrievalCandidate } from "../../utils/retrieval/retrieval-candidate.util.js";
import type { IVectorStore, VectorSearchOptions } from "../../lib/types/retrieval/retrieval.type.js";
import type { RetrievalCandidate } from "../../lib/types/selection/candidate.type.js";

export interface AtlasVectorStoreOptions {
  workflowTemplateModel: WorkflowTemplateModel;
  indexName?: string;
}

export class AtlasVectorStore implements IVectorStore {
  private readonly workflowTemplateModel: WorkflowTemplateModel;
  private readonly indexName: string;

  constructor({ workflowTemplateModel, indexName = config.retrieval.atlasIndexName }: AtlasVectorStoreOptions) {
    this.workflowTemplateModel = workflowTemplateModel;
    this.indexName = indexName;
  }

  async search(queryVector: number[], options: VectorSearchOptions = {}): Promise<RetrievalCandidate[]> {
    const rows = await this.workflowTemplateModel.vectorSearch(queryVector, {
      k: options.k ?? 5,
      institutionType: options.institutionType,
      indexName: this.indexName,
    });
    return rows.map((row) => toRetrievalCandidate(row, row.score));
  }
}
