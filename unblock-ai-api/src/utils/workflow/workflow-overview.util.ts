import { AssigneeSource } from "../../data/constants/assignee.constant.js";
import { UNSUPPORTED_INPUT_TYPES } from "../../data/constants/task-form.constant.js";
import { ENTRY_FORM_STEP_ID, ENTRY_FORM_STEP_NAME, TASK_STEP_KIND_BY_WORKFLOW_STEP_TYPE, TaskStepKind } from "../../data/constants/task.constant.js";
import { topologicalStepOrder } from "./graph-validator.util.js";
import { matchRequesterAttribute } from "../requester/requester-attribute-input.util.js";
import { titleCaseIdentifier } from "../shared/text.util.js";
import type { OrganisationCatalogue } from "../../lib/types/organisation/organisation-catalogue.type.js";
import type { WorkflowOverview, WorkflowOverviewAssignee, WorkflowOverviewStep } from "../../lib/types/selection/overview.type.js";
import type { Actor, ActorResolution } from "../../lib/types/workflow/actor.type.js";
import type { WorkflowDefinition, WorkflowInput } from "../../lib/types/workflow/workflow.type.js";

const REQUESTER_RESOLUTION: ActorResolution = "requester";

export function isDirectoryActor(actor: Actor): boolean {
  return actor.resolution === "dynamic" || actor.resolution === "static";
}

export function isDesignationRole(actor: Actor, catalogue: OrganisationCatalogue): boolean {
  return actor.role !== null && catalogue.designationsByCode.has(actor.role);
}

export function overviewAssignee(actor: Actor, catalogue: OrganisationCatalogue): WorkflowOverviewAssignee {
  switch (actor.resolution) {
    case "requester":
      return { source: AssigneeSource.REQUESTER, label: null };
    case "system":
      return { source: AssigneeSource.SYSTEM, label: null };
    case "dynamic":
    case "static": {
      const designation = actor.role === null ? undefined : catalogue.designationsByCode.get(actor.role);
      if (designation) return { source: AssigneeSource.DIRECTORY, label: designation.title };
      return { source: AssigneeSource.REQUESTER_SUPPLIED, label: actor.role === null ? actor.display_name : titleCaseIdentifier(actor.role) };
    }
  }
}

export function isCollectableRequesterInput(input: WorkflowInput): boolean {
  return input.collected_from.resolution === REQUESTER_RESOLUTION && !UNSUPPORTED_INPUT_TYPES.includes(input.type);
}

function entryFormInputs(definition: WorkflowDefinition): WorkflowInput[] {
  const collectedByStep = new Set(definition.steps.flatMap((step) => step.collects_inputs));
  return definition.inputs.filter(
    (input) => isCollectableRequesterInput(input) && matchRequesterAttribute(input) === null && !collectedByStep.has(input.id),
  );
}

function entryFormStep(): WorkflowOverviewStep {
  return {
    id: ENTRY_FORM_STEP_ID,
    name: ENTRY_FORM_STEP_NAME,
    kind: TaskStepKind.FORM,
    assignee: { source: AssigneeSource.REQUESTER, label: null },
    is_conditional: false,
  };
}

export function buildWorkflowOverview(
  workflowTemplateId: string,
  definition: WorkflowDefinition,
  catalogue: OrganisationCatalogue,
): WorkflowOverview {
  const workflowSteps: WorkflowOverviewStep[] = topologicalStepOrder(definition).map((step) => ({
    id: step.id,
    name: step.name,
    kind: TASK_STEP_KIND_BY_WORKFLOW_STEP_TYPE[step.type],
    assignee: overviewAssignee(step.assignee, catalogue),
    is_conditional: step.condition !== null,
  }));
  const needsEntryForm = entryFormInputs(definition).length > 0;

  return {
    workflow_template_id: workflowTemplateId,
    title: definition.title,
    one_liner: definition.retrieval_summary.one_liner,
    description: definition.description,
    steps: needsEntryForm ? [entryFormStep(), ...workflowSteps] : workflowSteps,
    information_needed: definition.inputs
      .filter((input) => isCollectableRequesterInput(input) && matchRequesterAttribute(input) === null)
      .map((input) => input.label),
    requires_approver_details: definition.steps.some(
      (step) => isDirectoryActor(step.assignee) && !isDesignationRole(step.assignee, catalogue),
    ),
  };
}
