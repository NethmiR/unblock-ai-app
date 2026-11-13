import { FIELD_ID_SEPARATOR, TASK_VALUE_NAMESPACES, TaskValueNamespace } from "../../data/constants/task.constant.js";
import type { RequesterAttribute } from "../../data/constants/requester.constant.js";

export interface ParsedFieldId {
  namespace: TaskValueNamespace;
  key: string;
}

function fieldId(namespace: TaskValueNamespace, key: string): string {
  return `${namespace}${FIELD_ID_SEPARATOR}${key}`;
}

export function inputFieldId(inputId: string): string {
  return fieldId(TaskValueNamespace.INPUTS, inputId);
}

export function requesterFieldId(attribute: RequesterAttribute): string {
  return fieldId(TaskValueNamespace.REQUESTER, attribute);
}

export function assigneeFieldId(stepId: string): string {
  return fieldId(TaskValueNamespace.ASSIGNEES, stepId);
}

export function informationResponseFieldId(stepId: string): string {
  return fieldId(TaskValueNamespace.RESPONSES, stepId);
}

function isTaskValueNamespace(value: string): value is TaskValueNamespace {
  return (TASK_VALUE_NAMESPACES as readonly string[]).includes(value);
}

export function parseFieldId(id: string): ParsedFieldId | null {
  const separatorIndex = id.indexOf(FIELD_ID_SEPARATOR);
  if (separatorIndex <= 0) return null;
  const namespace = id.slice(0, separatorIndex);
  const key = id.slice(separatorIndex + FIELD_ID_SEPARATOR.length);
  if (!isTaskValueNamespace(namespace) || key === "") return null;
  return { namespace, key };
}
