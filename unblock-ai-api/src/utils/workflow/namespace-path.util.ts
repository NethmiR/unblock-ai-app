import type { WorkflowDefinition } from "../../lib/types/workflow/workflow.type.js";
import type { WorkflowStep } from "../../lib/types/workflow/step.type.js";

export interface DeclaredNamespace {
  inputIds: Set<string>;
  computedIds: Set<string>;
  responseFieldsByStep: Map<string, Set<string>>;
}

export function declaredNamespaceIds(workflow: WorkflowDefinition): DeclaredNamespace {
  const inputIds = new Set((workflow.inputs ?? []).map((i) => i.id));
  const computedIds = new Set((workflow.computed ?? []).map((c) => c.id));
  const responseFieldsByStep = new Map<string, Set<string>>();
  for (const step of workflow.steps ?? []) {
    responseFieldsByStep.set(step.id, new Set((step.response_fields ?? []).map((f) => f.id)));
  }
  return { inputIds, computedIds, responseFieldsByStep };
}

export function isValidNamespacePath(
  path: unknown,
  steps: Map<string, WorkflowStep>,
  namespace: DeclaredNamespace,
): boolean {
  if (typeof path !== "string") return true;

  const [root, ...rest] = path.split(".");
  if (root === "inputs") {
    return rest.length === 1 && namespace.inputIds.has(rest[0] as string);
  }
  if (root === "computed") {
    return rest.length === 1 && namespace.computedIds.has(rest[0] as string);
  }
  if (root === "requester") {
    return rest.length === 1;
  }
  if (root === "system") {
    return rest.length === 1 && rest[0] === "today";
  }
  if (root === "steps") {
    const [stepId, field, responseFieldId] = rest;
    if (stepId === undefined || !steps.has(stepId)) return false;
    if (field === "outcome" || field === "assignee") {
      return rest.length === 2;
    }
    if (field === "response") {
      return rest.length === 3 && (namespace.responseFieldsByStep.get(stepId)?.has(responseFieldId as string) ?? false);
    }
    return false;
  }
  return true;
}

export function looksLikeNamespacePath(value: unknown): value is string {
  return typeof value === "string" && /^(inputs|computed|steps|requester|system)\./.test(value);
}
