import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryVectorStore } from "../../../src/services/vector-store/in-memory.vector-store.js";
import { FakeTemplateReader } from "../../helpers/fake-vector-store.helper.js";
import type { RetrievalProjection } from "../../../src/lib/types/template/template.type.js";

const ROWS: RetrievalProjection[] = [
  {
    workflow_id: "far",
    version: 1,
    title: "Far",
    description: "least similar",
    retrieval: { embedding: [0, 0, 0, 1], aliases_lower: ["far"], text: "far text" },
    document: { retrieval_summary: { one_liner: "far one-liner" } as RetrievalProjection["document"]["retrieval_summary"] },
  },
  {
    workflow_id: "exact",
    version: 3,
    title: "Exact",
    description: "identical to the query",
    retrieval: { embedding: [1, 0, 0, 0], aliases_lower: ["exact"], text: "exact text" },
    document: { retrieval_summary: { one_liner: "exact one-liner" } as RetrievalProjection["document"]["retrieval_summary"] },
  },
  {
    workflow_id: "near",
    version: 2,
    title: "Near",
    description: "partially similar",
    retrieval: { embedding: [Math.SQRT1_2, Math.SQRT1_2, 0, 0], aliases_lower: [], text: "near text" },
    document: { retrieval_summary: null as unknown as RetrievalProjection["document"]["retrieval_summary"] },
  },
];

const QUERY = [1, 0, 0, 0];

test("results are sorted by cosine similarity, highest first", async () => {
  const store = new InMemoryVectorStore({ templateReader: new FakeTemplateReader(ROWS) });
  const results = await store.search(QUERY, { k: 5 });

  assert.deepEqual(
    results.map((r) => r.workflow_id),
    ["exact", "near", "far"],
  );
  assert.ok(Math.abs((results[0]?.score ?? 0) - 1) < 1e-9);
  assert.ok(Math.abs((results[1]?.score ?? 0) - Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs((results[2]?.score ?? 0) - 0) < 1e-9);
});

test("k truncates the result list", async () => {
  const store = new InMemoryVectorStore({ templateReader: new FakeTemplateReader(ROWS) });
  const results = await store.search(QUERY, { k: 2 });

  assert.equal(results.length, 2);
  assert.deepEqual(
    results.map((r) => r.workflow_id),
    ["exact", "near"],
  );
});

test("k defaults to 5 when omitted", async () => {
  const store = new InMemoryVectorStore({ templateReader: new FakeTemplateReader(ROWS) });
  assert.equal((await store.search(QUERY)).length, 3);
});

test("institutionType is passed through to listForRetrieval", async () => {
  const reader = new FakeTemplateReader(ROWS);
  const store = new InMemoryVectorStore({ templateReader: reader });

  await store.search(QUERY, { k: 1, institutionType: "university" });

  assert.deepEqual(reader.calls, [{ institutionType: "university" }]);
});

test("each candidate carries the fields the selector needs", async () => {
  const store = new InMemoryVectorStore({ templateReader: new FakeTemplateReader(ROWS) });
  const [top] = await store.search(QUERY, { k: 1 });

  assert.equal(top?.workflow_id, "exact");
  assert.equal(top?.version, 3);
  assert.equal(top?.title, "Exact");
  assert.equal(top?.description, "identical to the query");
  assert.deepEqual(top?.aliases_lower, ["exact"]);
  assert.deepEqual(top?.retrieval_summary, { one_liner: "exact one-liner" });
  assert.equal(top?.retrieval_text, "exact text");
});

test("a row with no retrieval_summary yields null, not a crash", async () => {
  const store = new InMemoryVectorStore({ templateReader: new FakeTemplateReader(ROWS) });
  const results = await store.search(QUERY, { k: 5 });
  const near = results.find((r) => r.workflow_id === "near");

  assert.equal(near?.retrieval_summary, null);
  assert.deepEqual(near?.aliases_lower, []);
});

test("an empty corpus returns an empty list", async () => {
  const store = new InMemoryVectorStore({ templateReader: new FakeTemplateReader([]) });
  assert.deepEqual(await store.search(QUERY, { k: 5 }), []);
});
