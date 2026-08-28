import type { WorkflowComputed, WorkflowDefinition } from "../../lib/types/workflow/workflow.type.js";
import type { RequirementValue } from "../../lib/types/task/requirement.type.js";
import type { DocumentField } from "../../lib/types/document/document.type.js";
import { formatRequirementValue } from "../approval/answer-format.util.js";
import { titleCaseRole } from "../task/requirement-builder.util.js";
import { looksLikeNamespacePath } from "./namespace-path.util.js";

export function evaluateComputed(
  workflow: WorkflowDefinition,
  values: Record<string, RequirementValue>,
): DocumentField[] {
  const fields: DocumentField[] = [];
  const resolved = new Map<string, RequirementValue>();

  for (const computed of workflow.computed ?? []) {
    let result: RequirementValue = null;
    try {
      result = evaluateOperation(computed, values, resolved);
    } catch {
      result = null;
    }

    resolved.set(computed.id, result);

    if (result !== null) {
      fields.push({
        label: computed.description ?? titleCaseRole(computed.id),
        value: formatRequirementValue(result),
      });
    }
  }

  return fields;
}

function evaluateOperation(
  computed: WorkflowComputed,
  values: Record<string, RequirementValue>,
  resolved: Map<string, RequirementValue>,
): RequirementValue {
  const args = computed.arguments;

  switch (computed.operation) {
    case "date_diff_days": {
      const from = resolveDate(args.from, values, resolved);
      const to = resolveDate(args.to, values, resolved);
      if (from === null || to === null) return null;

      const days = Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
      return args.inclusive ? days + 1 : days;
    }

    case "sum": {
      const numbers = resolveNumbers(args.values, values, resolved);
      if (numbers === null) return null;
      return numbers.reduce((total, n) => total + n, 0);
    }

    case "difference": {
      const numbers = resolveNumbers(args.values, values, resolved);
      if (numbers === null || numbers.length === 0) return null;
      const [first, ...rest] = numbers;
      return rest.reduce((total, n) => total - n, first as number);
    }

    case "multiply": {
      const numbers = resolveNumbers(args.values, values, resolved);
      if (numbers === null || numbers.length === 0) return null;
      return numbers.reduce((total, n) => total * n, 1);
    }

    case "count": {
      let count = 0;
      for (const entry of args.values) {
        const value = typeof entry === "number" ? entry : resolveArgument(entry, values, resolved);
        if (isPresent(value)) count += 1;
      }
      return count;
    }

    case "lookup": {
      if (args.source === null) return null;
      const source = resolveArgument(args.source, values, resolved);
      if (source === null) return null;
      if (args.key === null) return source;
      if (typeof source !== "object") return null;
      return args.key === "name" || args.key === "email" ? source[args.key] : null;
    }

    case "constant":
      return args.value;

    default:
      return null;
  }
}

function resolveArgument(
  raw: string,
  values: Record<string, RequirementValue>,
  resolved: Map<string, RequirementValue>,
): RequirementValue {
  if (!looksLikeNamespacePath(raw)) return raw;

  const [root, id] = raw.split(".");
  if (root === "inputs" && id !== undefined) return values[id] ?? null;
  if (root === "computed" && id !== undefined) return resolved.has(id) ? resolved.get(id)! : null;
  return null;
}

function resolveDate(
  raw: string | null,
  values: Record<string, RequirementValue>,
  resolved: Map<string, RequirementValue>,
): Date | null {
  if (raw === null) return null;

  const value = resolveArgument(raw, values, resolved);
  if (typeof value !== "string") return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveNumbers(
  entries: Array<string | number>,
  values: Record<string, RequirementValue>,
  resolved: Map<string, RequirementValue>,
): number[] | null {
  const numbers: number[] = [];

  for (const entry of entries) {
    const value = typeof entry === "number" ? entry : resolveArgument(entry, values, resolved);
    const num = toNumber(value);
    if (num === null) return null;
    numbers.push(num);
  }

  return numbers;
}

function toNumber(value: RequirementValue): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function isPresent(value: RequirementValue): boolean {
  return value !== null && value !== undefined && value !== "";
}
