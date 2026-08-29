import test from "node:test";
import assert from "node:assert/strict";
import { evaluateComputed } from "../../../src/utils/workflow/computed-evaluator.util.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import type { WorkflowComputed, WorkflowDefinition } from "../../../src/lib/types/workflow/workflow.type.js";
import type { RequirementValue } from "../../../src/lib/types/task/requirement.type.js";

const BASE_WORKFLOW = loadExpectedFixture("it_faculty_overseas_leave.json");

function withComputed(computed: WorkflowComputed[]): WorkflowDefinition {
  return { ...BASE_WORKFLOW, computed };
}

function computedOf(overrides: Partial<WorkflowComputed>): WorkflowComputed {
  return {
    id: "result",
    description: "Result",
    operation: "constant",
    arguments: {
      from: null,
      to: null,
      inclusive: null,
      values: [],
      source: null,
      key: null,
      value: null,
    },
    ...overrides,
  };
}

test("date_diff_days computes an inclusive day span from two input dates", () => {
  const workflow = withComputed([
    computedOf({
      id: "trip_duration_days",
      operation: "date_diff_days",
      arguments: {
        from: "inputs.departure_date",
        to: "inputs.return_date",
        inclusive: true,
        values: [],
        source: null,
        key: null,
        value: null,
      },
    }),
  ]);
  const values: Record<string, RequirementValue> = {
    departure_date: "2026-03-01",
    return_date: "2026-03-10",
  };

  const fields = evaluateComputed(workflow, values);

  assert.deepEqual(fields, [{ label: "Result", value: "10" }]);
});

test("sum adds resolved input values and literal numbers together", () => {
  const workflow = withComputed([
    computedOf({
      operation: "sum",
      arguments: {
        from: null,
        to: null,
        inclusive: null,
        values: ["inputs.a", "inputs.b", 5],
        source: null,
        key: null,
        value: null,
      },
    }),
  ]);
  const values: Record<string, RequirementValue> = { a: 3, b: "4" };

  const fields = evaluateComputed(workflow, values);

  assert.deepEqual(fields, [{ label: "Result", value: "12" }]);
});

test("difference subtracts subsequent values from the first", () => {
  const workflow = withComputed([
    computedOf({
      operation: "difference",
      arguments: {
        from: null,
        to: null,
        inclusive: null,
        values: [10, "inputs.a"],
        source: null,
        key: null,
        value: null,
      },
    }),
  ]);

  const fields = evaluateComputed(workflow, { a: 3 });

  assert.deepEqual(fields, [{ label: "Result", value: "7" }]);
});

test("multiply multiplies all resolved values together", () => {
  const workflow = withComputed([
    computedOf({
      operation: "multiply",
      arguments: {
        from: null,
        to: null,
        inclusive: null,
        values: [2, "inputs.a"],
        source: null,
        key: null,
        value: null,
      },
    }),
  ]);

  const fields = evaluateComputed(workflow, { a: 6 });

  assert.deepEqual(fields, [{ label: "Result", value: "12" }]);
});

test("count counts how many of the listed values are actually present", () => {
  const workflow = withComputed([
    computedOf({
      operation: "count",
      arguments: {
        from: null,
        to: null,
        inclusive: null,
        values: ["inputs.a", "inputs.b", "inputs.c"],
        source: null,
        key: null,
        value: null,
      },
    }),
  ]);

  const fields = evaluateComputed(workflow, { a: "present", b: null });

  assert.deepEqual(fields, [{ label: "Result", value: "1" }]);
});

test("lookup extracts a named field from a resolved person value", () => {
  const workflow = withComputed([
    computedOf({
      operation: "lookup",
      arguments: {
        from: null,
        to: null,
        inclusive: null,
        values: [],
        source: "inputs.emergency_contact",
        key: "email",
        value: null,
      },
    }),
  ]);

  const fields = evaluateComputed(workflow, {
    emergency_contact: { name: "Sam Perera", email: "sam@example.com" },
  });

  assert.deepEqual(fields, [{ label: "Result", value: "sam@example.com" }]);
});

test("constant renders its declared literal value", () => {
  const workflow = withComputed([computedOf({ operation: "constant", arguments: { ...computedOf({}).arguments, value: "Fixed" } })]);

  const fields = evaluateComputed(workflow, {});

  assert.deepEqual(fields, [{ label: "Result", value: "Fixed" }]);
});

test("a computed value can reference an earlier computed value in declaration order", () => {
  const workflow = withComputed([
    computedOf({
      id: "base",
      description: "Base",
      operation: "constant",
      arguments: { from: null, to: null, inclusive: null, values: [], source: null, key: null, value: 4 },
    }),
    computedOf({
      id: "doubled",
      description: "Doubled",
      operation: "multiply",
      arguments: { from: null, to: null, inclusive: null, values: ["computed.base", 2], source: null, key: null, value: null },
    }),
  ]);

  const fields = evaluateComputed(workflow, {});

  assert.deepEqual(fields, [
    { label: "Base", value: "4" },
    { label: "Doubled", value: "8" },
  ]);
});

test("a forward reference to a not-yet-computed value yields null and is omitted", () => {
  const workflow = withComputed([
    computedOf({
      id: "early",
      description: "Early",
      operation: "sum",
      arguments: { from: null, to: null, inclusive: null, values: ["computed.later"], source: null, key: null, value: null },
    }),
    computedOf({
      id: "later",
      description: "Later",
      operation: "constant",
      arguments: { from: null, to: null, inclusive: null, values: [], source: null, key: null, value: 4 },
    }),
  ]);

  const fields = evaluateComputed(workflow, {});

  assert.deepEqual(fields, [{ label: "Later", value: "4" }]);
});

test("malformed arguments (missing required inputs) never throw and are simply omitted", () => {
  const workflow = withComputed([
    computedOf({
      operation: "date_diff_days",
      arguments: { from: "inputs.missing", to: null, inclusive: true, values: [], source: null, key: null, value: null },
    }),
  ]);

  assert.doesNotThrow(() => evaluateComputed(workflow, {}));
  assert.deepEqual(evaluateComputed(workflow, {}), []);
});

test("a missing description falls back to a title-cased id", () => {
  const workflow = withComputed([
    computedOf({ id: "trip_duration_days", description: null, operation: "constant", arguments: { ...computedOf({}).arguments, value: 1 } }),
  ]);

  const fields = evaluateComputed(workflow, {});

  assert.deepEqual(fields, [{ label: "Trip Duration Days", value: "1" }]);
});
