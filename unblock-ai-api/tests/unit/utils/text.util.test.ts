import test from "node:test";
import assert from "node:assert/strict";
import { compareText, normalizeDisplayName, normalizeOptionalText } from "../../../src/utils/shared/text.util.js";

test("normalizeDisplayName trims and collapses inner whitespace", () => {
  assert.equal(normalizeDisplayName("  Department   of\tCivil \n Engineering "), "Department of Civil Engineering");
});

test("normalizeOptionalText returns null for null, empty and whitespace-only input", () => {
  assert.equal(normalizeOptionalText(null), null);
  assert.equal(normalizeOptionalText(""), null);
  assert.equal(normalizeOptionalText("   "), null);
});

test("normalizeOptionalText trims meaningful text", () => {
  assert.equal(normalizeOptionalText("  Handles examinations  "), "Handles examinations");
});

test("compareText orders case-insensitively", () => {
  assert.equal(compareText("apple", "Apple"), 0);
  assert.ok(compareText("Architecture", "business") < 0);
});
