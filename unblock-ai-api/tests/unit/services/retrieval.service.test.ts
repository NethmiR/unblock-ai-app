import test from "node:test";
import assert from "node:assert/strict";
import { RetrievalService } from "../../../src/services/retrieval.service.js";
import type { EmbeddingService } from "../../../src/services/embedding.service.js";
import type { IVectorStore, VectorSearchOptions } from "../../../src/lib/types/retrieval/retrieval.type.js";
import type { RetrievalCandidate } from "../../../src/lib/types/selection/candidate.type.js";
import type { RetrievalConfig } from "../../../src/lib/types/config/config.type.js";

const RETRIEVAL_CONFIG: RetrievalConfig = {
  topK: 3,
  aliasBoost: 0.15,
  maxSelectionRounds: 2,
  vectorBackend: "memory",
  atlasIndexName: "template_vector_index",
};

function candidate(overrides: Partial<RetrievalCandidate>): RetrievalCandidate {
  return {
    workflow_id: "x",
    version: 1,
    title: "X",
    description: "",
    score: 0.5,
    aliases_lower: [],
    retrieval_summary: null,
    retrieval_text: "",
    ...overrides,
  };
}

function fakeEmbeddingService(vector: number[] = [1, 0, 0, 0]): EmbeddingService {
  return { embedQuery: () => Promise.resolve(vector) } as unknown as EmbeddingService;
}

function fakeVectorStore(rows: RetrievalCandidate[]): IVectorStore & { calls: VectorSearchOptions[] } {
  const calls: VectorSearchOptions[] = [];
  return {
    calls,
    search(_queryVector: number[], options: VectorSearchOptions = {}) {
      calls.push(options);
      return Promise.resolve(rows);
    },
  };
}

test("over-fetches k+2 candidates from the vector store", async () => {
  const vectorStore = fakeVectorStore([]);
  const service = new RetrievalService({
    vectorStore,
    embeddingService: fakeEmbeddingService(),
    retrievalConfig: RETRIEVAL_CONFIG,
  });

  await service.retrieve("overseas leave");

  assert.equal(vectorStore.calls[0]?.k, RETRIEVAL_CONFIG.topK + 2);
});

test("applies the configured alias boost before slicing", async () => {
  const rows = [
    candidate({ workflow_id: "a", score: 0.7, aliases_lower: ["overseas leave"] }),
    candidate({ workflow_id: "b", score: 0.75, aliases_lower: [] }),
  ];
  const vectorStore = fakeVectorStore(rows);
  const service = new RetrievalService({
    vectorStore,
    embeddingService: fakeEmbeddingService(),
    retrievalConfig: RETRIEVAL_CONFIG,
  });

  const results = await service.retrieve("I need overseas leave");

  assert.equal(results[0]?.workflow_id, "a");
  assert.ok(Math.abs((results[0]?.score ?? 0) - 0.85) < 1e-9);
});

test("slices the boosted results down to topK", async () => {
  const rows = Array.from({ length: 6 }, (_, i) => candidate({ workflow_id: `wf_${i}`, score: 1 - i * 0.1 }));
  const vectorStore = fakeVectorStore(rows);
  const service = new RetrievalService({
    vectorStore,
    embeddingService: fakeEmbeddingService(),
    retrievalConfig: RETRIEVAL_CONFIG,
  });

  const results = await service.retrieve("anything");

  assert.equal(results.length, RETRIEVAL_CONFIG.topK);
});

test("passes institutionType through to the vector store", async () => {
  const vectorStore = fakeVectorStore([]);
  const service = new RetrievalService({
    vectorStore,
    embeddingService: fakeEmbeddingService(),
    retrievalConfig: RETRIEVAL_CONFIG,
  });

  await service.retrieve("anything", { institutionType: "university" });

  assert.equal(vectorStore.calls[0]?.institutionType, "university");
});
