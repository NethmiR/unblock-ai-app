import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryVectorStore } from "../../../src/services/vector-store/in-memory.vector-store.js";
import { FakeRetrievalReader } from "../../helpers/fake-vector-store.helper.js";
import type { RetrievalSummary } from "../../../src/lib/types/workflow/retrieval-summary.type.js";
import type { WorkflowTemplateRetrievalProjection } from "../../../src/lib/types/workflow-template/workflow-template.type.js";

function row(
  id: string,
  currentVersion: number,
  description: string | null,
  embedding: number[],
  aliasesLower: string[],
  retrievalSummary: RetrievalSummary | null,
): WorkflowTemplateRetrievalProjection {
  return {
    _id: id,
    title: id.charAt(0).toUpperCase() + id.slice(1),
    description,
    current_version: currentVersion,
    retrieval: {
      text: `${id} text`,
      embedding,
      aliases_lower: aliasesLower,
      retrieval_summary: retrievalSummary as RetrievalSummary,
      institution_type: "university",
      model: "fake",
      dim: embedding.length,
      embedded_at: "2026-01-01T00:00:00.000Z",
    },
  };
}

function summary(oneLiner: string): RetrievalSummary {
  return { one_liner: oneLiner, aliases: [], keywords: [], requester_types: [], triggers: [], not_for: [] };
}

const ROWS: WorkflowTemplateRetrievalProjection[] = [
  row("far", 1, "least similar", [0, 0, 0, 1], ["far"], summary("far one-liner")),
  row("exact", 3, "identical to the query", [1, 0, 0, 0], ["exact"], summary("exact one-liner")),
  row("near", 2, null, [Math.SQRT1_2, Math.SQRT1_2, 0, 0], [], null),
];

const QUERY = [1, 0, 0, 0];

function storeOver(rows: WorkflowTemplateRetrievalProjection[] = ROWS): InMemoryVectorStore {
  return new InMemoryVectorStore({ retrievalReader: new FakeRetrievalReader(rows) });
}

test("results are sorted by cosine similarity, highest first", async () => {
  const results = await storeOver().search(QUERY, { k: 5 });

  assert.deepEqual(
    results.map((r) => r.workflow_template_id),
    ["exact", "near", "far"],
  );
  assert.ok(Math.abs((results[0]?.score ?? 0) - 1) < 1e-9);
  assert.ok(Math.abs((results[1]?.score ?? 0) - Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs((results[2]?.score ?? 0) - 0) < 1e-9);
});

test("k truncates the result list", async () => {
  const results = await storeOver().search(QUERY, { k: 2 });

  assert.equal(results.length, 2);
  assert.deepEqual(
    results.map((r) => r.workflow_template_id),
    ["exact", "near"],
  );
});

test("k defaults to 5 when omitted", async () => {
  assert.equal((await storeOver().search(QUERY)).length, 3);
});

test("institutionType is passed through to listForRetrieval", async () => {
  const reader = new FakeRetrievalReader(ROWS);
  const store = new InMemoryVectorStore({ retrievalReader: reader });

  await store.search(QUERY, { k: 1, institutionType: "university" });

  assert.deepEqual(reader.calls, [{ institutionType: "university" }]);
});

test("each candidate carries the fields the selector needs", async () => {
  const [top] = await storeOver().search(QUERY, { k: 1 });

  assert.equal(top?.workflow_template_id, "exact");
  assert.equal(top?.workflow_template_version, 3);
  assert.equal(top?.title, "Exact");
  assert.equal(top?.description, "identical to the query");
  assert.deepEqual(top?.aliases_lower, ["exact"]);
  assert.deepEqual(top?.retrieval_summary, summary("exact one-liner"));
  assert.equal(top?.retrieval_text, "exact text");
});

test("a row with no description or summary yields safe defaults, not a crash", async () => {
  const results = await storeOver().search(QUERY, { k: 5 });
  const near = results.find((r) => r.workflow_template_id === "near");

  assert.equal(near?.description, "");
  assert.equal(near?.retrieval_summary, null);
  assert.deepEqual(near?.aliases_lower, []);
});

test("an empty corpus returns an empty list", async () => {
  assert.deepEqual(await storeOver([]).search(QUERY, { k: 5 }), []);
});
