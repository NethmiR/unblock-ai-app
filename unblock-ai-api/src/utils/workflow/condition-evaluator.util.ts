import { CONDITION_LIST_SEPARATOR } from "../../data/constants/condition.constant.js";
import { looksLikeNamespacePath } from "./namespace-path.util.js";
import type { Condition, ConditionValue } from "../../lib/types/workflow/condition.type.js";
import type { ConditionNamespace, TaskFieldValue } from "../../lib/types/task/task-value.type.js";

type Scalar = string | number | boolean;

function toScalar(value: TaskFieldValue | undefined): Scalar | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return value.email;
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

function resolveOperand(operand: ConditionValue, namespace: ConditionNamespace): Scalar | null {
  if (looksLikeNamespacePath(operand)) return toScalar(namespace.get(operand));
  return operand;
}

function toNumber(value: Scalar): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function compare(left: Scalar, right: Scalar): number | null {
  if (typeof left === "number" || typeof right === "number") {
    const a = toNumber(left);
    const b = toNumber(right);
    return a === null || b === null ? null : a - b;
  }
  if (typeof left === "string" && typeof right === "string") {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (typeof left === "boolean" && typeof right === "boolean") return left === right ? 0 : null;
  return null;
}

function areEqual(left: Scalar, right: Scalar): boolean {
  const order = compare(left, right);
  return order === null ? String(left) === String(right) : order === 0;
}

function isInList(left: Scalar, right: Scalar): boolean {
  if (typeof right !== "string") return areEqual(left, right);
  return right
    .split(CONDITION_LIST_SEPARATOR)
    .map((entry) => entry.trim())
    .some((entry) => areEqual(left, entry));
}

function negate(value: boolean | null): boolean | null {
  return value === null ? null : !value;
}

function evaluateAnd(results: readonly (boolean | null)[]): boolean | null {
  if (results.includes(false)) return false;
  return results.includes(null) ? null : true;
}

function evaluateOr(results: readonly (boolean | null)[]): boolean | null {
  if (results.includes(true)) return true;
  return results.includes(null) ? null : false;
}

function evaluateComparison(condition: Condition, namespace: ConditionNamespace): boolean | null {
  const left = resolveOperand(condition.left, namespace);
  if (condition.operator === "exists") return left !== null;

  const right = resolveOperand(condition.right, namespace);
  if (left === null || right === null) return null;

  switch (condition.operator) {
    case "equals":
      return areEqual(left, right);
    case "not_equals":
      return !areEqual(left, right);
    case "in":
      return isInList(left, right);
    case "not_in":
      return !isInList(left, right);
    case "greater_than":
    case "less_than":
    case "greater_or_equal":
    case "less_or_equal": {
      const order = compare(left, right);
      if (order === null) return null;
      if (condition.operator === "greater_than") return order > 0;
      if (condition.operator === "less_than") return order < 0;
      if (condition.operator === "greater_or_equal") return order >= 0;
      return order <= 0;
    }
    default:
      return null;
  }
}

export function evaluateCondition(condition: Condition, namespace: ConditionNamespace): boolean | null {
  switch (condition.operator) {
    case "and":
      return evaluateAnd(condition.clauses.map((clause) => evaluateCondition(clause, namespace)));
    case "or":
      return evaluateOr(condition.clauses.map((clause) => evaluateCondition(clause, namespace)));
    case "not": {
      const [clause] = condition.clauses;
      return clause === undefined ? null : negate(evaluateCondition(clause, namespace));
    }
    case "equals":
    case "not_equals":
    case "greater_than":
    case "less_than":
    case "greater_or_equal":
    case "less_or_equal":
    case "in":
    case "not_in":
    case "exists":
      return evaluateComparison(condition, namespace);
    default: {
      const unreachable: never = condition;
      return unreachable;
    }
  }
}
