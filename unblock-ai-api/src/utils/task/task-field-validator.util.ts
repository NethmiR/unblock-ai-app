import {
  DATE_BOUND_TODAY,
  FORM_VALUE_PATTERN,
  FormFieldControl,
  FormFieldIssueCode,
  FormValidationMode,
} from "../../data/constants/task-form.constant.js";
import { TASK_FIELD_LIMIT } from "../../data/constants/task.constant.js";
import { inputFieldId, parseFieldId } from "./task-field-id.util.js";
import type { FormFieldIssue, FormValuesInput, TaskFormField } from "../../lib/types/task/task-form.type.js";
import type { PersonValue, TaskFieldValue } from "../../lib/types/task/task-value.type.js";

export interface ValidateFormValuesInput {
  fields: readonly TaskFormField[];
  values: FormValuesInput;
  allValues: Readonly<Record<string, TaskFieldValue>>;
  mode: FormValidationMode;
  today?: string;
}

export interface ValidateFormValuesResult {
  values: Record<string, TaskFieldValue>;
  issues: FormFieldIssue[];
}

type Coerced = { ok: true; value: TaskFieldValue } | { ok: false; code: FormFieldIssueCode };

const TEXT_CONTROLS: readonly FormFieldControl[] = [
  FormFieldControl.TEXT,
  FormFieldControl.TEXTAREA,
  FormFieldControl.EMAIL,
  FormFieldControl.PHONE,
  FormFieldControl.SELECT,
];

const DATE_CONTROLS: readonly FormFieldControl[] = [FormFieldControl.DATE, FormFieldControl.DATETIME];

function ok(value: TaskFieldValue): Coerced {
  return { ok: true, value };
}

function fail(code: FormFieldIssueCode): Coerced {
  return { ok: false, code };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isEmptyFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (isPlainObject(value)) return isEmptyFieldValue(value.name) && isEmptyFieldValue(value.email);
  return false;
}

function coerceString(value: unknown): Coerced {
  return typeof value === "string" ? ok(value.trim()) : fail(FormFieldIssueCode.INVALID_TYPE);
}

function coerceMatching(value: unknown, pattern: RegExp, code: FormFieldIssueCode): Coerced {
  const coerced = coerceString(value);
  if (!coerced.ok || typeof coerced.value !== "string") return coerced;
  return pattern.test(coerced.value) ? coerced : fail(code);
}

function coerceDate(value: unknown, pattern: RegExp): Coerced {
  const coerced = coerceMatching(value, pattern, FormFieldIssueCode.INVALID_DATE);
  if (!coerced.ok || typeof coerced.value !== "string") return coerced;
  return Number.isNaN(Date.parse(coerced.value)) ? fail(FormFieldIssueCode.INVALID_DATE) : coerced;
}

function coerceNumber(value: unknown): Coerced {
  const candidate = typeof value === "string" ? Number(value.trim()) : value;
  return typeof candidate === "number" && Number.isFinite(candidate) ? ok(candidate) : fail(FormFieldIssueCode.INVALID_TYPE);
}

function coerceBoolean(value: unknown): Coerced {
  return typeof value === "boolean" ? ok(value) : fail(FormFieldIssueCode.INVALID_TYPE);
}

function coercePerson(value: unknown): Coerced {
  if (!isPlainObject(value) || typeof value.name !== "string" || typeof value.email !== "string") {
    return fail(FormFieldIssueCode.INVALID_TYPE);
  }
  const name = value.name.trim();
  const email = value.email.trim();
  if (name === "") return fail(FormFieldIssueCode.INVALID_TYPE);
  if (!FORM_VALUE_PATTERN.EMAIL.test(email)) return fail(FormFieldIssueCode.INVALID_EMAIL);
  const person: PersonValue = { user_id: null, name, email };
  return ok(person);
}

function coerceSelect(field: TaskFormField, value: unknown): Coerced {
  const coerced = coerceString(value);
  if (!coerced.ok) return coerced;
  return field.options.some((option) => option.value === coerced.value) ? coerced : fail(FormFieldIssueCode.NOT_AN_OPTION);
}

function coerceByControl(field: TaskFormField, value: unknown): Coerced {
  switch (field.control) {
    case FormFieldControl.TEXT:
    case FormFieldControl.TEXTAREA:
      return coerceString(value);
    case FormFieldControl.EMAIL:
      return coerceMatching(value, FORM_VALUE_PATTERN.EMAIL, FormFieldIssueCode.INVALID_EMAIL);
    case FormFieldControl.PHONE:
      return coerceMatching(value, FORM_VALUE_PATTERN.PHONE, FormFieldIssueCode.INVALID_PHONE);
    case FormFieldControl.DATE:
      return coerceDate(value, FORM_VALUE_PATTERN.DATE);
    case FormFieldControl.DATETIME:
      return coerceDate(value, FORM_VALUE_PATTERN.DATETIME);
    case FormFieldControl.NUMBER:
      return coerceNumber(value);
    case FormFieldControl.SWITCH:
      return coerceBoolean(value);
    case FormFieldControl.SELECT:
      return coerceSelect(field, value);
    case FormFieldControl.PERSON:
      return coercePerson(value);
    default: {
      const unreachable: never = field.control;
      return unreachable;
    }
  }
}

function matchesPattern(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return true;
  }
}

function lookupBoundValue(bound: string, merged: Readonly<Record<string, TaskFieldValue>>): string | null {
  const direct = merged[bound];
  if (typeof direct === "string") return direct;
  if (parseFieldId(bound) === null) {
    const legacy = merged[inputFieldId(bound)];
    if (typeof legacy === "string") return legacy;
  }
  return null;
}

function resolveDateBound(
  bound: string | null,
  merged: Readonly<Record<string, TaskFieldValue>>,
  today: string,
): string | null {
  if (bound === null || bound.trim() === "") return null;
  if (bound === DATE_BOUND_TODAY) return today;
  if (FORM_VALUE_PATTERN.DATE.test(bound) || FORM_VALUE_PATTERN.DATETIME.test(bound)) return bound;
  return lookupBoundValue(bound, merged);
}

function compareDates(value: string, bound: string): number {
  const length = Math.min(value.length, bound.length);
  const a = value.slice(0, length);
  const b = bound.slice(0, length);
  return a < b ? -1 : a > b ? 1 : 0;
}

interface RuleContext {
  merged: Readonly<Record<string, TaskFieldValue>>;
  today: string;
}

function dateIssue(field: TaskFormField, value: string, context: RuleContext): FormFieldIssue | null {
  const validation = field.validation;
  if (validation === null) return null;
  const earliest = [validation.not_before, validation.not_before_field];
  for (const raw of earliest) {
    const bound = resolveDateBound(raw, context.merged, context.today);
    if (bound !== null && compareDates(value, bound) < 0) {
      return { field_id: field.id, code: FormFieldIssueCode.BEFORE_EARLIEST_DATE, limit: bound };
    }
  }
  const latest = [validation.not_after, validation.not_after_field];
  for (const raw of latest) {
    const bound = resolveDateBound(raw, context.merged, context.today);
    if (bound !== null && compareDates(value, bound) > 0) {
      return { field_id: field.id, code: FormFieldIssueCode.AFTER_LATEST_DATE, limit: bound };
    }
  }
  return null;
}

function stringIssue(field: TaskFormField, value: string): FormFieldIssue | null {
  const validation = field.validation;
  const maxLength = Math.min(validation?.max_length ?? TASK_FIELD_LIMIT.TEXT_MAX_LENGTH, TASK_FIELD_LIMIT.TEXT_MAX_LENGTH);
  if (validation?.min_length != null && value.length < validation.min_length) {
    return { field_id: field.id, code: FormFieldIssueCode.TOO_SHORT, limit: validation.min_length };
  }
  if (value.length > maxLength) {
    return { field_id: field.id, code: FormFieldIssueCode.TOO_LONG, limit: maxLength };
  }
  if (validation?.pattern != null && !matchesPattern(validation.pattern, value)) {
    return { field_id: field.id, code: FormFieldIssueCode.PATTERN_MISMATCH, limit: null };
  }
  return null;
}

function numberIssue(field: TaskFormField, value: number): FormFieldIssue | null {
  const validation = field.validation;
  if (validation?.min != null && value < validation.min) {
    return { field_id: field.id, code: FormFieldIssueCode.BELOW_MINIMUM, limit: validation.min };
  }
  if (validation?.max != null && value > validation.max) {
    return { field_id: field.id, code: FormFieldIssueCode.ABOVE_MAXIMUM, limit: validation.max };
  }
  return null;
}

function ruleIssue(field: TaskFormField, value: TaskFieldValue, context: RuleContext): FormFieldIssue | null {
  if (typeof value === "number") return numberIssue(field, value);
  if (typeof value !== "string") return null;
  if (DATE_CONTROLS.includes(field.control)) return dateIssue(field, value, context);
  if (TEXT_CONTROLS.includes(field.control)) return stringIssue(field, value);
  return null;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function validateFormValues(input: ValidateFormValuesInput): ValidateFormValuesResult {
  const fieldsById = new Map(input.fields.map((field) => [field.id, field]));
  const issues: FormFieldIssue[] = [];
  const values: Record<string, TaskFieldValue> = {};

  for (const [id, raw] of Object.entries(input.values)) {
    const field = fieldsById.get(id);
    if (field === undefined) {
      issues.push({ field_id: id, code: FormFieldIssueCode.UNKNOWN_FIELD, limit: null });
      continue;
    }
    if (field.locked) {
      issues.push({ field_id: id, code: FormFieldIssueCode.LOCKED, limit: null });
      continue;
    }
    if (isEmptyFieldValue(raw)) {
      values[id] = null;
      continue;
    }
    const coerced = coerceByControl(field, raw);
    if (coerced.ok) values[id] = coerced.value;
    else issues.push({ field_id: id, code: coerced.code, limit: null });
  }

  const context: RuleContext = { merged: { ...input.allValues, ...values }, today: input.today ?? todayIsoDate() };
  const invalidIds = new Set(issues.map((issue) => issue.field_id));

  for (const field of input.fields) {
    if (field.locked || invalidIds.has(field.id)) continue;
    const provided = Object.prototype.hasOwnProperty.call(values, field.id);
    const value = context.merged[field.id] ?? null;
    if (isEmptyFieldValue(value)) {
      if (input.mode === FormValidationMode.SUBMIT && field.required) {
        issues.push({ field_id: field.id, code: FormFieldIssueCode.REQUIRED, limit: null });
      }
      continue;
    }
    if (!provided && input.mode === FormValidationMode.DRAFT) continue;
    const issue = ruleIssue(field, value, context);
    if (issue !== null) issues.push(issue);
  }

  return { values, issues };
}
