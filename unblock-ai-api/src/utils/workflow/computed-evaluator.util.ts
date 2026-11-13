import { titleCaseIdentifier } from "../shared/text.util.js";
import { looksLikeNamespacePath } from "./namespace-path.util.js";
import type { WorkflowComputed, WorkflowDefinition } from "../../lib/types/workflow/workflow.type.js";
import type { TaskFieldValue } from "../../lib/types/task/task-value.type.js";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const PERSON_LOOKUP_KEYS = ["name", "email"] as const;

export type ComputedInputLookup = (inputId: string) => TaskFieldValue | undefined;

type ResolvedValues = Map<string, TaskFieldValue>;

function resolveArgument(raw: string, lookup: ComputedInputLookup, resolved: ResolvedValues): TaskFieldValue {
  if (!looksLikeNamespacePath(raw)) return raw;
  const [root, id] = raw.split(".");
  if (id === undefined) return null;
  if (root === "inputs") return lookup(id) ?? null;
  if (root === "computed") return resolved.get(id) ?? null;
  return null;
}

function toNumber(value: TaskFieldValue): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function isPresent(value: TaskFieldValue): boolean {
  return value !== null && value !== "";
}

function resolveDate(raw: string | null, lookup: ComputedInputLookup, resolved: ResolvedValues): Date | null {
  if (raw === null) return null;
  const value = resolveArgument(raw, lookup, resolved);
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveNumbers(entries: Array<string | number>, lookup: ComputedInputLookup, resolved: ResolvedValues): number[] | null {
  const numbers: number[] = [];
  for (const entry of entries) {
    const number = toNumber(typeof entry === "number" ? entry : resolveArgument(entry, lookup, resolved));
    if (number === null) return null;
    numbers.push(number);
  }
  return numbers;
}

function evaluateOperation(computed: WorkflowComputed, lookup: ComputedInputLookup, resolved: ResolvedValues): TaskFieldValue {
  const args = computed.arguments;
  switch (computed.operation) {
    case "date_diff_days": {
      const from = resolveDate(args.from, lookup, resolved);
      const to = resolveDate(args.to, lookup, resolved);
      if (from === null || to === null) return null;
      const days = Math.round((to.getTime() - from.getTime()) / MILLISECONDS_PER_DAY);
      return args.inclusive ? days + 1 : days;
    }
    case "sum": {
      const numbers = resolveNumbers(args.values, lookup, resolved);
      return numbers === null ? null : numbers.reduce((total, n) => total + n, 0);
    }
    case "difference": {
      const numbers = resolveNumbers(args.values, lookup, resolved);
      if (numbers === null || numbers.length === 0) return null;
      const [first, ...rest] = numbers;
      return rest.reduce((total, n) => total - n, first ?? 0);
    }
    case "multiply": {
      const numbers = resolveNumbers(args.values, lookup, resolved);
      if (numbers === null || numbers.length === 0) return null;
      return numbers.reduce((total, n) => total * n, 1);
    }
    case "count":
      return args.values.filter((entry) => typeof entry === "number" || isPresent(resolveArgument(entry, lookup, resolved))).length;
    case "lookup": {
      if (args.source === null) return null;
      const source = resolveArgument(args.source, lookup, resolved);
      if (source === null) return null;
      if (args.key === null) return source;
      if (typeof source !== "object") return null;
      const key = PERSON_LOOKUP_KEYS.find((candidate) => candidate === args.key);
      return key === undefined ? null : source[key];
    }
    case "constant":
      return args.value;
    default:
      return null;
  }
}

export function computeValues(workflow: WorkflowDefinition, lookup: ComputedInputLookup): Map<string, TaskFieldValue> {
  const resolved: ResolvedValues = new Map();
  for (const computed of workflow.computed ?? []) {
    let result: TaskFieldValue = null;
    try {
      result = evaluateOperation(computed, lookup, resolved);
    } catch {
      result = null;
    }
    resolved.set(computed.id, result);
  }
  return resolved;
}

export function computedLabel(computed: WorkflowComputed): string {
  return computed.description ?? titleCaseIdentifier(computed.id);
}
