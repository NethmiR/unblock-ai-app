import test from "node:test";
import assert from "node:assert/strict";
import { buildReference } from "../../../src/utils/task/reference.util.js";

test("zero-pads the sequence to 5 digits", () => {
  assert.equal(buildReference(42, new Date("2026-01-01T00:00:00Z")), "TASK-2026-00042");
});

test("uses the year from the provided date", () => {
  assert.equal(buildReference(1, new Date("2030-06-15T00:00:00Z")), "TASK-2030-00001");
});

test("does not truncate a sequence wider than the padding", () => {
  assert.equal(buildReference(123456, new Date("2026-01-01T00:00:00Z")), "TASK-2026-123456");
});
