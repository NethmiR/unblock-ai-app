import { InMemoryVectorStore } from "./in-memory.vector-store.js";
import { AtlasVectorStore } from "./atlas.vector-store.js";
import type { IVectorStore } from "../../lib/types/retrieval/retrieval.type.js";
import type { WorkflowTemplateModel } from "../../models/workflow-template.model.js";

export { InMemoryVectorStore } from "./in-memory.vector-store.js";
export { AtlasVectorStore } from "./atlas.vector-store.js";
export type { IVectorStore, IWorkflowTemplateRetrievalReader, VectorSearchOptions } from "./vector-store.interface.js";

export interface CreateVectorStoreDeps {
  workflowTemplateModel: WorkflowTemplateModel;
  indexName?: string;
}

export function createVectorStore(backend: "memory" | "atlas", deps: CreateVectorStoreDeps): IVectorStore {
  if (backend === "atlas") {
    return new AtlasVectorStore({ workflowTemplateModel: deps.workflowTemplateModel, indexName: deps.indexName });
  }
  return new InMemoryVectorStore({ retrievalReader: deps.workflowTemplateModel });
}
