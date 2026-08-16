import type { WorkflowDefinition } from "../../lib/types/workflow/workflow.type.js";
import type { TaskRequirement } from "../../lib/types/task/requirement.type.js";
import { topologicalStepOrder } from "../workflow/graph-validator.util.js";

function titleCaseRole(role: string): string {
  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildInputRequirements(workflow: WorkflowDefinition): TaskRequirement[] {
  return (workflow.inputs ?? [])
    .filter((input) => input.collected_from.resolution === "requester")
    .map((input) => ({
      key: input.id,
      source: "input",
      ref: input.id,
      label: input.label,
      description: input.description,
      type: input.type,
      required: input.required,
      validation: input.validation,
      collection_hint: input.collection_hint,
      status: "pending",
    }));
}

function buildActorRequirements(workflow: WorkflowDefinition): TaskRequirement[] {
  const requirements: TaskRequirement[] = [];
  const seen = new Map<string, string>();

  for (const step of topologicalStepOrder(workflow)) {
    if (step.assignee.resolution !== "dynamic") continue;

    const dedupeKey = `${step.assignee.role ?? ""}|${step.assignee.relative_to ?? ""}`;
    if (seen.has(dedupeKey)) continue;

    const key = `actor:${step.id}`;
    seen.set(dedupeKey, key);

    const label = step.assignee.role ? titleCaseRole(step.assignee.role) : step.name;

    // Approver identity is supplied by the requester, not resolved via a directory —
    // see task-planner-design.md §9 for the accepted trust consequence.
    requirements.push({
      key,
      source: "actor",
      ref: step.id,
      label,
      description: null,
      type: "person",
      required: true,
      validation: null,
      collection_hint: `Name and email address of your ${label}.`,
      status: "pending",
    });
  }

  return requirements;
}

export function buildRequirements(workflow: WorkflowDefinition): TaskRequirement[] {
  return [...buildInputRequirements(workflow), ...buildActorRequirements(workflow)];
}
