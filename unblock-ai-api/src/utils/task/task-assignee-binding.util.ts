import { FormFieldBindingKind } from "../../data/constants/task-form.constant.js";
import type { TaskAssignee, TaskDocument } from "../../lib/types/task/task-document.type.js";
import type { TaskFormRecord } from "../../lib/types/task/task-form.type.js";
import type { TaskFieldValue } from "../../lib/types/task/task-value.type.js";

function boundAssignee(assignee: TaskAssignee, value: TaskFieldValue | undefined): TaskAssignee {
  if (value === undefined || value === null) return assignee;
  if (typeof value === "object") return { ...assignee, user_id: null, full_name: value.name, email: value.email };
  if (typeof value !== "string") return assignee;
  const holder = assignee.candidates.find((candidate) => candidate.user_id === value);
  return holder ? { ...assignee, user_id: holder.user_id, full_name: holder.name, email: holder.email } : assignee;
}

export function applyAssigneeFieldValues(task: TaskDocument, form: TaskFormRecord): TaskDocument {
  const valueByStep = new Map<string, TaskFieldValue | undefined>();
  for (const field of form.sections.flatMap((section) => section.fields)) {
    if (field.binding.kind === FormFieldBindingKind.ASSIGNEE) valueByStep.set(field.binding.step_id, task.values[field.id]);
  }
  if (valueByStep.size === 0) return task;
  return {
    ...task,
    steps: task.steps.map((step) =>
      step.assignee !== null && valueByStep.has(step.id) ? { ...step, assignee: boundAssignee(step.assignee, valueByStep.get(step.id)) } : step,
    ),
  };
}
