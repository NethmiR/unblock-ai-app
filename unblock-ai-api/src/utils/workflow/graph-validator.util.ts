import type { WorkflowDefinition } from "../../lib/types/workflow/workflow.type.js";
import type { Condition } from "../../lib/types/workflow/condition.type.js";
import type { WorkflowStep } from "../../lib/types/workflow/step.type.js";
import { declaredNamespaceIds, isValidNamespacePath, looksLikeNamespacePath } from "./namespace-path.util.js";

type StepMap = Map<string, WorkflowStep>;
type Check = (workflow: WorkflowDefinition, steps: StepMap, errors: string[]) => void;

function stepIndex(workflow: WorkflowDefinition): StepMap {
  const byId = new Map<string, WorkflowStep>();
  for (const step of workflow.steps ?? []) {
    byId.set(step.id, step);
  }
  return byId;
}

function checkDependencyReferences(_workflow: WorkflowDefinition, steps: StepMap, errors: string[]): void {
  for (const step of steps.values()) {
    for (const dep of step.depends_on ?? []) {
      if (!steps.has(dep.step_id)) {
        errors.push(`Step '${step.id}' depends on unknown step '${dep.step_id}'`);
      }
    }
  }
}

function hasOutcome(step: WorkflowStep, outcomeKey: string): boolean {
  return (step.outcomes as unknown as Record<string, unknown>)[outcomeKey] != null;
}

function checkRequiredOutcomes(_workflow: WorkflowDefinition, steps: StepMap, errors: string[]): void {
  for (const step of steps.values()) {
    for (const dep of step.depends_on ?? []) {
      const target = steps.get(dep.step_id);
      if (!target) continue;
      if (!hasOutcome(target, dep.required_outcome)) {
        errors.push(
          `Step '${step.id}' depends on outcome '${dep.required_outcome}' of step ` +
            `'${dep.step_id}', which has no such outcome`,
        );
      }
    }
  }
}

function checkNoCycles(_workflow: WorkflowDefinition, steps: StepMap, errors: string[]): void {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>([...steps.keys()].map((id) => [id, WHITE]));

  function visit(id: string, path: string[]): void {
    if (color.get(id) === BLACK) return;
    if (color.get(id) === GRAY) {
      const cycle = [...path.slice(path.indexOf(id)), id].join(" -> ");
      errors.push(`Dependency cycle detected: ${cycle}`);
      return;
    }
    color.set(id, GRAY);
    const step = steps.get(id);
    for (const dep of step?.depends_on ?? []) {
      if (steps.has(dep.step_id)) {
        visit(dep.step_id, [...path, id]);
      }
    }
    color.set(id, BLACK);
  }

  for (const id of steps.keys()) {
    visit(id, []);
  }
}

function checkEntryStepExists(_workflow: WorkflowDefinition, steps: StepMap, errors: string[]): void {
  const hasEntry = [...steps.values()].some((step) => (step.depends_on ?? []).length === 0);
  if (!hasEntry) {
    errors.push("No step has an empty depends_on; the workflow has no entry point and can never start");
  }
}

function checkReachability(_workflow: WorkflowDefinition, steps: StepMap, errors: string[]): void {
  const reachable = new Set<string>();
  const dependents = new Map<string, string[]>([...steps.keys()].map((id) => [id, []]));
  for (const step of steps.values()) {
    for (const dep of step.depends_on ?? []) {
      dependents.get(dep.step_id)?.push(step.id);
    }
  }

  const queue = [...steps.values()].filter((step) => (step.depends_on ?? []).length === 0).map((step) => step.id);
  for (const id of queue) reachable.add(id);

  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const next of dependents.get(id) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }

  for (const id of steps.keys()) {
    if (!reachable.has(id)) {
      errors.push(`Step '${id}' is unreachable from any entry step`);
    }
  }
}

function checkApprovalOutcomes(_workflow: WorkflowDefinition, steps: StepMap, errors: string[]): void {
  for (const step of steps.values()) {
    if (step.type !== "approval") continue;
    if (!hasOutcome(step, "approved")) {
      errors.push(`Approval step '${step.id}' is missing an 'approved' outcome`);
    }
    if (!hasOutcome(step, "rejected")) {
      errors.push(`Approval step '${step.id}' is missing a 'rejected' outcome`);
    }
  }
}

function checkCompletionRequiredSteps(workflow: WorkflowDefinition, steps: StepMap, errors: string[]): void {
  for (const stepId of workflow.completion?.required_steps ?? []) {
    if (!steps.has(stepId)) {
      errors.push(`completion.required_steps references unknown step '${stepId}'`);
    }
  }
}

function checkConditionPaths(
  condition: Condition | null | undefined,
  steps: StepMap,
  namespace: ReturnType<typeof declaredNamespaceIds>,
  errors: string[],
  context: string,
): void {
  if (!condition) return;
  for (const side of ["left", "right"] as const) {
    const value = condition[side];
    if (looksLikeNamespacePath(value) && !isValidNamespacePath(value, steps, namespace)) {
      errors.push(`${context}: '${side}' references unknown path '${value}'`);
    }
  }
  for (const clause of condition.clauses ?? []) {
    checkConditionPaths(clause, steps, namespace, errors, context);
  }
}

function checkNamespacePaths(workflow: WorkflowDefinition, steps: StepMap, errors: string[]): void {
  const namespace = declaredNamespaceIds(workflow);

  for (const computed of workflow.computed ?? []) {
    for (const [key, value] of Object.entries(computed.arguments ?? {})) {
      if (looksLikeNamespacePath(value) && !isValidNamespacePath(value, steps, namespace)) {
        errors.push(`computed '${computed.id}': argument '${key}' references unknown path '${value}'`);
      }
    }
  }

  for (const step of steps.values()) {
    checkConditionPaths(step.condition, steps, namespace, errors, `Step '${step.id}' condition`);
    for (const binding of step.context_from_steps ?? []) {
      const path = `steps.${binding.step_id}.response.${binding.field}`;
      if (!isValidNamespacePath(path, steps, namespace)) {
        errors.push(`Step '${step.id}' context_from_steps references unknown path '${path}'`);
      }
    }
  }
}

const CHECKS: Check[] = [
  checkDependencyReferences,
  checkRequiredOutcomes,
  checkNoCycles,
  checkEntryStepExists,
  checkReachability,
  checkApprovalOutcomes,
  checkCompletionRequiredSteps,
  checkNamespacePaths,
];

export function validateGraph(workflow: WorkflowDefinition): string[] {
  const steps = stepIndex(workflow);
  const errors: string[] = [];
  for (const check of CHECKS) {
    check(workflow, steps, errors);
  }
  return errors;
}
