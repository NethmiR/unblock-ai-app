import { InMemoryVectorStore } from "./in-memory.vector-store.js";
import { AtlasVectorStore } from "./atlas.vector-store.js";
import type { ITemplateReader, IVectorStore } from "../../lib/types/retrieval/retrieval.type.js";
import type { TemplateModel } from "../../models/template.model.js";

export { InMemoryVectorStore } from "./in-memory.vector-store.js";
export { AtlasVectorStore } from "./atlas.vector-store.js";
export type { IVectorStore, ITemplateReader, VectorSearchOptions } from "./vector-store.interface.js";

export interface CreateVectorStoreDeps {
  templateReader: ITemplateReader;
  templateModel: TemplateModel;
  indexName?: string;
}

export function createVectorStore(backend: "memory" | "atlas", deps: CreateVectorStoreDeps): IVectorStore {
  if (backend === "atlas") {
    return new AtlasVectorStore({ templateModel: deps.templateModel, indexName: deps.indexName });
  }
  return new InMemoryVectorStore({ templateReader: deps.templateReader });
}
