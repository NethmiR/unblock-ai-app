import test from "node:test";
import assert from "node:assert/strict";
import { renderForEmbedding, renderAliasesLower } from "../../../src/utils/retrieval/render-summary.util.js";
import type { WorkflowDefinition } from "../../../src/lib/types/workflow/workflow.type.js";

const workflow = {
  workflow_id: "demo",
  title: "Demo Workflow",
  retrieval_summary: {
    one_liner: "A one-line description.",
    aliases: ["Demo", "demo  ", "DEMO"],
    keywords: ["a", "b"],
    requester_types: ["students"],
    triggers: ["when demoing"],
    not_for: ["production"],
  },
} as unknown as WorkflowDefinition;

test("title is the first line", () => {
  assert.equal(renderForEmbedding(workflow).split("\n")[0], "Demo Workflow");
});

test("empty arrays produce no line at all", () => {
  const sparse = {
    ...workflow,
    retrieval_summary: { ...workflow.retrieval_summary, not_for: [], keywords: [] },
  } as unknown as WorkflowDefinition;
  const text = renderForEmbedding(sparse);
  assert.ok(!text.includes("Not for"));
  assert.ok(!text.includes("Keywords"));
});

test("rendering is deterministic", () => {
  assert.equal(renderForEmbedding(workflow), renderForEmbedding(workflow));
});

test("missing retrieval_summary throws a directive error", () => {
  const noSummary = { workflow_id: "x", title: "X" } as unknown as WorkflowDefinition;
  assert.throws(() => renderForEmbedding(noSummary), /backfillSummaries/);
});

test("aliases are lowercased, trimmed, and deduped", () => {
  assert.deepEqual(renderAliasesLower(workflow), ["demo"]);
});
