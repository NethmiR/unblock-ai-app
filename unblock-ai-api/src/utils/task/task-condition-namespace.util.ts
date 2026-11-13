import { ConditionNamespaceRoot, STEP_OUTCOME_PATH_FIELD, SYSTEM_TODAY_PATH } from "../../data/constants/condition.constant.js";
import { TaskFormStatus } from "../../data/constants/task-form.constant.js";
import { TaskValueNamespace } from "../../data/constants/task.constant.js";
import { computeValues } from "../workflow/computed-evaluator.util.js";
import { inputFieldId, parseFieldId } from "./task-field-id.util.js";
import type { TaskDocument } from "../../lib/types/task/task-document.type.js";
import type { ConditionNamespace, TaskFieldValue } from "../../lib/types/task/task-value.type.js";
import type { WorkflowDefinition } from "../../lib/types/workflow/workflow.type.js";

const NAMESPACE_SEPARATOR = ".";

function trustedFieldIds(task: TaskDocument): { trusted: Set<string>; formFields: Set<string> } {
  const trusted = new Set<string>();
  const formFields = new Set<string>();
  for (const form of task.forms) {
    for (const field of form.sections.flatMap((section) => section.fields)) {
      formFields.add(field.id);
      if (field.locked || form.status === TaskFormStatus.SUBMITTED) trusted.add(field.id);
    }
  }
  return { trusted, formFields };
}

export function trustedTaskValues(task: TaskDocument): Map<string, TaskFieldValue> {
  const { trusted, formFields } = trustedFieldIds(task);
  const values = new Map<string, TaskFieldValue>();
  for (const [fieldId, value] of Object.entries(task.values)) {
    if (trusted.has(fieldId) || !formFields.has(fieldId)) values.set(fieldId, value);
  }
  return values;
}

export function buildConditionNamespace(task: TaskDocument, definition: WorkflowDefinition, now: Date): ConditionNamespace {
  const namespace = new Map<string, TaskFieldValue>();
  const trusted = trustedTaskValues(task);
  for (const [fieldId, value] of trusted) {
    const parsed = parseFieldId(fieldId);
    if (parsed?.namespace === TaskValueNamespace.INPUTS || parsed?.namespace === TaskValueNamespace.REQUESTER) namespace.set(fieldId, value);
  }

  const computed = computeValues(definition, (inputId) => trusted.get(inputFieldId(inputId)));
  for (const [id, value] of computed) {
    if (value !== null) namespace.set(`${ConditionNamespaceRoot.COMPUTED}${NAMESPACE_SEPARATOR}${id}`, value);
  }

  for (const step of task.steps) {
    if (step.outcome === null || step.definition_step_id === null) continue;
    namespace.set(
      [ConditionNamespaceRoot.STEPS, step.definition_step_id, STEP_OUTCOME_PATH_FIELD].join(NAMESPACE_SEPARATOR),
      step.outcome,
    );
  }

  namespace.set(SYSTEM_TODAY_PATH, now.toISOString().slice(0, 10));
  return namespace;
}
