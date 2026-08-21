import test from "node:test";
import assert from "node:assert/strict";
import { formatRequirementValue } from "../../../src/utils/approval/answer-format.util.js";

test("null formats as an empty string", () => {
  assert.equal(formatRequirementValue(null), "");
});

test("true formats as Yes", () => {
  assert.equal(formatRequirementValue(true), "Yes");
});

test("false formats as No", () => {
  assert.equal(formatRequirementValue(false), "No");
});

test("a PersonValue formats as 'name (email)'", () => {
  assert.equal(
    formatRequirementValue({ name: "Jane Perera", email: "jane@example.com" }),
    "Jane Perera (jane@example.com)",
  );
});

test("a number formats via String()", () => {
  assert.equal(formatRequirementValue(42), "42");
});

test("a string passes through unchanged", () => {
  assert.equal(formatRequirementValue("Colombo"), "Colombo");
});
