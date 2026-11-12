import test from "node:test";
import assert from "node:assert/strict";
import { applyAliasBoost } from "../../../src/utils/retrieval/alias-boost.util.js";
import type { RetrievalCandidate } from "../../../src/lib/types/selection/candidate.type.js";

function candidate(overrides: Partial<RetrievalCandidate>): RetrievalCandidate {
  return {
    workflow_template_id: "x",
    workflow_template_version: 1,
    title: "X",
    description: "",
    score: 0,
    aliases_lower: [],
    retrieval_summary: null,
    retrieval_text: "",
    ...overrides,
  };
}

const candidates: RetrievalCandidate[] = [
  candidate({ workflow_template_id: "a", score: 0.7, aliases_lower: ["overseas leave"] }),
  candidate({ workflow_template_id: "b", score: 0.75, aliases_lower: ["hall booking"] }),
];

test("an alias hit can overtake a higher raw score", () => {
  const out = applyAliasBoost(candidates, "I need overseas leave", 0.15);
  assert.equal(out[0]?.workflow_template_id, "a");
  assert.ok(Math.abs((out[0]?.score ?? 0) - 0.85) < 1e-9);
  assert.deepEqual(out[0]?.alias_hits, ["overseas leave"]);
});

test("no alias hit leaves the ordering untouched", () => {
  const out = applyAliasBoost(candidates, "something unrelated", 0.15);
  assert.equal(out[0]?.workflow_template_id, "b");
  assert.deepEqual(out[0]?.alias_hits, []);
});

test("matching is case-insensitive", () => {
  const out = applyAliasBoost(candidates, "OVERSEAS LEAVE please", 0.15);
  assert.equal(out[0]?.workflow_template_id, "a");
});

test("base_score is preserved for debugging", () => {
  const out = applyAliasBoost(candidates, "overseas leave", 0.15);
  assert.equal(out[0]?.base_score, 0.7);
});

test("candidates without aliases do not crash", () => {
  const out = applyAliasBoost([candidate({ workflow_template_id: "c", score: 0.5 })], "anything", 0.15);
  assert.equal(out[0]?.score, 0.5);
});
