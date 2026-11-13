import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCondition } from "../../../src/utils/workflow/condition-evaluator.util.js";
import type { Condition, ConditionOperator, ConditionValue } from "../../../src/lib/types/workflow/condition.type.js";
import type { TaskFieldValue } from "../../../src/lib/types/task/task-value.type.js";

function comparison(operator: Exclude<ConditionOperator, "and" | "or" | "not">, left: ConditionValue, right: ConditionValue): Condition {
  return { operator, left, right, clauses: [], description: null };
}

function compound(operator: "and" | "or" | "not", clauses: Condition[]): Condition {
  return { operator, left: null, right: null, clauses, description: null };
}

const namespace = new Map<string, TaskFieldValue>([
  ["computed.trip_duration_days", 45],
  ["inputs.destination", "Japan"],
  ["inputs.departure_date", "2026-12-01"],
  ["inputs.is_funded", false],
  ["inputs.amount", "1200"],
  ["requester.faculty", "Faculty of Information Technology"],
  ["steps.hod_approval.outcome", "approved"],
  ["system.today", "2026-11-13"],
  ["inputs.blank", null],
]);

test("equals and not_equals compare resolved values", () => {
  assert.equal(evaluateCondition(comparison("equals", "inputs.destination", "Japan"), namespace), true);
  assert.equal(evaluateCondition(comparison("equals", "steps.hod_approval.outcome", "approved"), namespace), true);
  assert.equal(evaluateCondition(comparison("not_equals", "inputs.destination", "Japan"), namespace), false);
  assert.equal(evaluateCondition(comparison("equals", "inputs.is_funded", false), namespace), true);
  assert.equal(evaluateCondition(comparison("equals", "inputs.amount", 1200), namespace), true);
});

test("ordering operators compare numbers numerically and dates lexically", () => {
  assert.equal(evaluateCondition(comparison("greater_than", "computed.trip_duration_days", 30), namespace), true);
  assert.equal(evaluateCondition(comparison("less_than", "computed.trip_duration_days", 30), namespace), false);
  assert.equal(evaluateCondition(comparison("greater_or_equal", "computed.trip_duration_days", 45), namespace), true);
  assert.equal(evaluateCondition(comparison("less_or_equal", "computed.trip_duration_days", 44), namespace), false);
  assert.equal(evaluateCondition(comparison("greater_than", "inputs.departure_date", "system.today"), namespace), true);
  assert.equal(evaluateCondition(comparison("greater_than", "inputs.amount", 1000), namespace), true);
});

test("in and not_in read a comma separated list", () => {
  assert.equal(evaluateCondition(comparison("in", "inputs.destination", "India, Japan, Korea"), namespace), true);
  assert.equal(evaluateCondition(comparison("not_in", "inputs.destination", "India, Korea"), namespace), true);
  assert.equal(evaluateCondition(comparison("in", "inputs.destination", "India"), namespace), false);
});

test("exists is false for a missing or empty value", () => {
  assert.equal(evaluateCondition(comparison("exists", "inputs.destination", null), namespace), true);
  assert.equal(evaluateCondition(comparison("exists", "inputs.blank", null), namespace), false);
  assert.equal(evaluateCondition(comparison("exists", "inputs.unknown", null), namespace), false);
});

test("a comparison with a missing value is not evaluable", () => {
  assert.equal(evaluateCondition(comparison("greater_than", "computed.unknown", 30), namespace), null);
  assert.equal(evaluateCondition(comparison("equals", "inputs.blank", "x"), namespace), null);
  assert.equal(evaluateCondition(comparison("greater_than", "inputs.destination", 3), namespace), null);
});

test("and, or and not use three-valued logic", () => {
  const yes = comparison("equals", "inputs.destination", "Japan");
  const no = comparison("equals", "inputs.destination", "India");
  const unknown = comparison("equals", "inputs.unknown", "x");

  assert.equal(evaluateCondition(compound("and", [yes, yes]), namespace), true);
  assert.equal(evaluateCondition(compound("and", [yes, no]), namespace), false);
  assert.equal(evaluateCondition(compound("and", [unknown, no]), namespace), false);
  assert.equal(evaluateCondition(compound("and", [unknown, yes]), namespace), null);
  assert.equal(evaluateCondition(compound("or", [no, yes]), namespace), true);
  assert.equal(evaluateCondition(compound("or", [no, no]), namespace), false);
  assert.equal(evaluateCondition(compound("or", [unknown, no]), namespace), null);
  assert.equal(evaluateCondition(compound("not", [no]), namespace), true);
  assert.equal(evaluateCondition(compound("not", [unknown]), namespace), null);
  assert.equal(evaluateCondition(compound("not", []), namespace), null);
});
