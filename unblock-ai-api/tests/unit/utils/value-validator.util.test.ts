import test from "node:test";
import assert from "node:assert/strict";
import { validateValue } from "../../../src/utils/task/value-validator.util.js";
import type { TaskRequirement } from "../../../src/lib/types/task/requirement.type.js";

function makeRequirement(overrides: Partial<TaskRequirement> = {}): TaskRequirement {
  return {
    key: "field",
    source: "input",
    ref: "field",
    label: "Field",
    description: null,
    type: "string",
    required: true,
    validation: null,
    collection_hint: null,
    status: "pending",
    ...overrides,
  };
}

test("string: happy path returns the value", () => {
  const req = makeRequirement({ type: "string" });
  assert.equal(validateValue(req, "hello", {}), "hello");
});

test("number: coerces numeric strings and accepts finite numbers", () => {
  const req = makeRequirement({ type: "number" });
  assert.equal(validateValue(req, 42, {}), 42);
  assert.equal(validateValue(req, "42", {}), 42);
});

test("number: rejects non-finite input", () => {
  const req = makeRequirement({ type: "number" });
  assert.throws(() => validateValue(req, "not-a-number", {}));
});

test("date: happy path accepts ISO YYYY-MM-DD", () => {
  const req = makeRequirement({ type: "date" });
  assert.equal(validateValue(req, "2026-08-17", {}), "2026-08-17");
});

test("date: rejects malformed date strings", () => {
  const req = makeRequirement({ type: "date" });
  assert.throws(() => validateValue(req, "17-08-2026", {}));
});

test("email: happy path accepts a valid address", () => {
  const req = makeRequirement({ type: "email" });
  assert.equal(validateValue(req, "person@example.com", {}), "person@example.com");
});

test("email: rejects a bad email", () => {
  const req = makeRequirement({ type: "email" });
  assert.throws(() => validateValue(req, "not-an-email", {}));
});

test("boolean: happy path accepts real booleans", () => {
  const req = makeRequirement({ type: "boolean" });
  assert.equal(validateValue(req, true, {}), true);
  assert.equal(validateValue(req, false, {}), false);
});

test("boolean: rejects a truthy non-boolean", () => {
  const req = makeRequirement({ type: "boolean" });
  assert.throws(() => validateValue(req, "true", {}));
});

test("person: happy path accepts name + email", () => {
  const req = makeRequirement({ type: "person" });
  const value = validateValue(req, { name: "Jane Advisor", email: "jane@example.com" }, {});
  assert.deepEqual(value, { name: "Jane Advisor", email: "jane@example.com" });
});

test("person: missing email is rejected", () => {
  const req = makeRequirement({ type: "person" });
  assert.throws(() => validateValue(req, { name: "Jane Advisor" }, {}));
});

test("person: bad email is rejected", () => {
  const req = makeRequirement({ type: "person" });
  assert.throws(() => validateValue(req, { name: "Jane Advisor", email: "nope" }, {}));
});

test("person: empty name is rejected", () => {
  const req = makeRequirement({ type: "person" });
  assert.throws(() => validateValue(req, { name: "  ", email: "jane@example.com" }, {}));
});

test("null is accepted when the requirement is optional", () => {
  const req = makeRequirement({ type: "string", required: false });
  assert.equal(validateValue(req, null, {}), null);
});

test("null is rejected when the requirement is required", () => {
  const req = makeRequirement({ type: "string", required: true });
  assert.throws(() => validateValue(req, null, {}));
});

test("cross-field: return date after departure date is accepted", () => {
  const req = makeRequirement({
    key: "return_date",
    type: "date",
    validation: {
      min_length: null,
      max_length: null,
      min: null,
      max: null,
      not_before: null,
      not_after: null,
      not_before_field: "inputs.departure_date",
      not_after_field: null,
      pattern: null,
    },
  });
  const allValues = { departure_date: "2026-09-01" };
  assert.equal(validateValue(req, "2026-09-10", allValues), "2026-09-10");
});

test("cross-field: return date before departure date is rejected", () => {
  const req = makeRequirement({
    key: "return_date",
    type: "date",
    validation: {
      min_length: null,
      max_length: null,
      min: null,
      max: null,
      not_before: null,
      not_after: null,
      not_before_field: "inputs.departure_date",
      not_after_field: null,
      pattern: null,
    },
  });
  const allValues = { departure_date: "2026-09-01" };
  assert.throws(() => validateValue(req, "2026-08-01", allValues));
});

test("not_before: 'today' rejects a past date", () => {
  const req = makeRequirement({
    key: "departure_date",
    type: "date",
    validation: {
      min_length: null,
      max_length: null,
      min: null,
      max: null,
      not_before: "today",
      not_after: null,
      not_before_field: null,
      not_after_field: null,
      pattern: null,
    },
  });
  assert.throws(() => validateValue(req, "2000-01-01", {}));
});

test("min_length / max_length are enforced on strings", () => {
  const req = makeRequirement({
    type: "string",
    validation: {
      min_length: 2,
      max_length: 5,
      min: null,
      max: null,
      not_before: null,
      not_after: null,
      not_before_field: null,
      not_after_field: null,
      pattern: null,
    },
  });
  assert.throws(() => validateValue(req, "a", {}));
  assert.throws(() => validateValue(req, "abcdef", {}));
  assert.equal(validateValue(req, "abc", {}), "abc");
});

test("min / max are enforced on numbers", () => {
  const req = makeRequirement({
    type: "number",
    validation: {
      min_length: null,
      max_length: null,
      min: 1,
      max: 10,
      not_before: null,
      not_after: null,
      not_before_field: null,
      not_after_field: null,
      pattern: null,
    },
  });
  assert.throws(() => validateValue(req, 0, {}));
  assert.throws(() => validateValue(req, 11, {}));
  assert.equal(validateValue(req, 5, {}), 5);
});

test("pattern is enforced on strings", () => {
  const req = makeRequirement({
    type: "string",
    validation: {
      min_length: null,
      max_length: null,
      min: null,
      max: null,
      not_before: null,
      not_after: null,
      not_before_field: null,
      not_after_field: null,
      pattern: "^[A-Z]{2}\\d{4}$",
    },
  });
  assert.throws(() => validateValue(req, "abcd", {}));
  assert.equal(validateValue(req, "AB1234", {}), "AB1234");
});
