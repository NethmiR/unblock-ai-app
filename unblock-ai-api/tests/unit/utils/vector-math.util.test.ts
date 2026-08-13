import test from "node:test";
import assert from "node:assert/strict";
import { l2normalize, cosineSimilarity } from "../../../src/utils/retrieval/vector-math.util.js";

test("l2normalize produces a unit vector", () => {
  const v = l2normalize([3, 4]);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-10);
  assert.deepEqual(v, [0.6, 0.8]);
});

test("l2normalize handles the zero vector without dividing by zero", () => {
  assert.deepEqual(l2normalize([0, 0, 0]), [0, 0, 0]);
});

test("cosine of identical unit vectors is 1", () => {
  const v = l2normalize([1, 2, 3]);
  assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 1e-10);
});

test("cosine of orthogonal vectors is 0", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-10);
});

test("cosineSimilarity rejects mismatched dimensions", () => {
  assert.throws(() => cosineSimilarity([1, 2], [1, 2, 3]), /Dimension mismatch/);
});
