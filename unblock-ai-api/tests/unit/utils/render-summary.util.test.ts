import test from "node:test";
import assert from "node:assert/strict";
import { renderForEmbedding, renderAliasesLower } from "../../../src/utils/retrieval/render-summary.util.js";
import type { RetrievalSummary } from "../../../src/lib/types/workflow/retrieval-summary.type.js";

const TITLE = "Demo Workflow";

const SUMMARY: RetrievalSummary = {
  one_liner: "A one-line description.",
  aliases: ["Demo", "demo  ", "DEMO"],
  keywords: ["a", "b"],
  requester_types: ["students"],
  triggers: ["when demoing"],
  not_for: ["production"],
};

test("title is the first line and the one-liner the second", () => {
  const lines = renderForEmbedding(TITLE, SUMMARY).split("\n");
  assert.equal(lines[0], TITLE);
  assert.equal(lines[1], SUMMARY.one_liner);
});

test("every populated field is rendered with its label", () => {
  const text = renderForEmbedding(TITLE, SUMMARY);
  assert.match(text, /Also known as: Demo, demo {2}, DEMO/);
  assert.match(text, /Applies to: students/);
  assert.match(text, /Use when: when demoing/);
  assert.match(text, /Keywords: a, b/);
  assert.match(text, /Not for: production/);
});

test("empty arrays produce no line at all", () => {
  const text = renderForEmbedding(TITLE, { ...SUMMARY, not_for: [], keywords: [] });
  assert.ok(!text.includes("Not for"));
  assert.ok(!text.includes("Keywords"));
});

test("rendering is deterministic", () => {
  assert.equal(renderForEmbedding(TITLE, SUMMARY), renderForEmbedding(TITLE, SUMMARY));
});

test("aliases are lowercased, trimmed, and deduped", () => {
  assert.deepEqual(renderAliasesLower(SUMMARY), ["demo"]);
});

test("blank aliases are dropped", () => {
  assert.deepEqual(renderAliasesLower({ ...SUMMARY, aliases: ["  ", "Leave"] }), ["leave"]);
});
