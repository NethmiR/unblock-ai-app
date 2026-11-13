import { FormFieldControl, type FormFieldIssueDto, type TaskFieldValueDto, type TaskFormDto, type TaskFormFieldDto } from "@/types/task-form";

export interface PersonDraftValue {
  name: string;
  email: string;
}

export type TaskFormDraftValue = string | boolean | PersonDraftValue;

export interface TaskFormDraftState {
  formId: string;
  baselineKey: string;
  initial: Readonly<Record<string, TaskFormDraftValue>>;
  values: Readonly<Record<string, TaskFormDraftValue>>;
  issues: Readonly<Record<string, FormFieldIssueDto>>;
}

export enum TaskFormDraftActionKind {
  FIELD_CHANGED = "field_changed",
  ISSUES_SET = "issues_set",
  RESET = "reset",
}

export type TaskFormDraftAction =
  | { kind: TaskFormDraftActionKind.FIELD_CHANGED; fieldId: string; value: TaskFormDraftValue }
  | { kind: TaskFormDraftActionKind.ISSUES_SET; issues: readonly FormFieldIssueDto[] }
  | { kind: TaskFormDraftActionKind.RESET; form: TaskFormDto };

export function editableFields(form: TaskFormDto): TaskFormFieldDto[] {
  return form.sections.flatMap((section) => section.fields).filter((field) => !field.locked);
}

export function formBaselineKey(form: TaskFormDto): string {
  return [form.id, form.saved_at ?? "", form.submitted_at ?? "", form.status].join("|");
}

export function toDraftValue(field: TaskFormFieldDto, value: TaskFieldValueDto): TaskFormDraftValue {
  switch (field.control) {
    case FormFieldControl.SWITCH:
      return value === true;
    case FormFieldControl.PERSON:
      return typeof value === "object" && value !== null ? { name: value.name, email: value.email } : { name: "", email: "" };
    case FormFieldControl.TEXT:
    case FormFieldControl.TEXTAREA:
    case FormFieldControl.NUMBER:
    case FormFieldControl.DATE:
    case FormFieldControl.DATETIME:
    case FormFieldControl.EMAIL:
    case FormFieldControl.PHONE:
    case FormFieldControl.SELECT:
      return value === null || typeof value === "object" ? "" : String(value);
    default: {
      const unreachable: never = field.control;
      return unreachable;
    }
  }
}

export function toRequestValue(value: TaskFormDraftValue): TaskFieldValueDto {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (value.name.trim() === "" && value.email.trim() === "") return null;
  return { user_id: null, name: value.name, email: value.email };
}

function issuesById(issues: readonly FormFieldIssueDto[]): Record<string, FormFieldIssueDto> {
  const byId: Record<string, FormFieldIssueDto> = {};
  for (const issue of issues) if (byId[issue.field_id] === undefined) byId[issue.field_id] = issue;
  return byId;
}

export function initialDraftFromForm(form: TaskFormDto): TaskFormDraftState {
  const initial: Record<string, TaskFormDraftValue> = {};
  for (const field of editableFields(form)) initial[field.id] = toDraftValue(field, field.value);
  return { formId: form.id, baselineKey: formBaselineKey(form), initial, values: initial, issues: {} };
}

export function taskFormDraftReducer(state: TaskFormDraftState, action: TaskFormDraftAction): TaskFormDraftState {
  switch (action.kind) {
    case TaskFormDraftActionKind.FIELD_CHANGED: {
      const issues = { ...state.issues };
      delete issues[action.fieldId];
      return { ...state, values: { ...state.values, [action.fieldId]: action.value }, issues };
    }
    case TaskFormDraftActionKind.ISSUES_SET:
      return { ...state, issues: issuesById(action.issues) };
    case TaskFormDraftActionKind.RESET:
      return initialDraftFromForm(action.form);
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

function sameDraftValue(a: TaskFormDraftValue | undefined, b: TaskFormDraftValue | undefined): boolean {
  if (typeof a === "object" && typeof b === "object") return a.name === b.name && a.email === b.email;
  return a === b;
}

export function changedValues(state: TaskFormDraftState): Record<string, TaskFieldValueDto> {
  const changed: Record<string, TaskFieldValueDto> = {};
  for (const [fieldId, value] of Object.entries(state.values)) {
    if (!sameDraftValue(value, state.initial[fieldId])) changed[fieldId] = toRequestValue(value);
  }
  return changed;
}

export function allRequestValues(state: TaskFormDraftState): Record<string, TaskFieldValueDto> {
  const values: Record<string, TaskFieldValueDto> = {};
  for (const [fieldId, value] of Object.entries(state.values)) values[fieldId] = toRequestValue(value);
  return values;
}

export function isDraftDirty(state: TaskFormDraftState): boolean {
  return Object.keys(changedValues(state)).length > 0;
}
