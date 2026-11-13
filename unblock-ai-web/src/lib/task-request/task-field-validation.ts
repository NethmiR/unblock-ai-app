import {
  DATE_BOUND_TODAY,
  FIELD_ID_SEPARATOR,
  FORM_VALUE_PATTERN,
  FormFieldControl,
  FormFieldIssueCode,
  FormValidationMode,
  TASK_FIELD_LIMIT,
  TaskValueNamespace,
  type FormFieldIssueDto,
  type TaskFieldValueDto,
  type TaskFormDto,
  type TaskFormFieldDto,
} from "@/types/task-form";

const TASK_VALUE_NAMESPACES: ReadonlySet<string> = new Set(Object.values(TaskValueNamespace));

function isNamespacedFieldId(id: string): boolean {
  const separatorIndex = id.indexOf(FIELD_ID_SEPARATOR);
  return separatorIndex > 0 && separatorIndex < id.length - 1 && TASK_VALUE_NAMESPACES.has(id.slice(0, separatorIndex));
}

export interface ValidateFormDraftInput {
  fields: readonly TaskFormFieldDto[];
  values: Readonly<Record<string, TaskFieldValueDto>>;
  allValues: Readonly<Record<string, TaskFieldValueDto>>;
  mode: FormValidationMode;
  today: string;
}

type Coerced = { ok: true; value: TaskFieldValueDto } | { ok: false; code: FormFieldIssueCode };

const TEXT_CONTROLS: readonly FormFieldControl[] = [
  FormFieldControl.TEXT,
  FormFieldControl.TEXTAREA,
  FormFieldControl.EMAIL,
  FormFieldControl.PHONE,
  FormFieldControl.SELECT,
];

const DATE_CONTROLS: readonly FormFieldControl[] = [FormFieldControl.DATE, FormFieldControl.DATETIME];

function ok(value: TaskFieldValueDto): Coerced {
  return { ok: true, value };
}

function fail(code: FormFieldIssueCode): Coerced {
  return { ok: false, code };
}

export function isEmptyFieldValue(value: TaskFieldValueDto | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "object") return value.name.trim() === "" && value.email.trim() === "";
  return false;
}

function coerceString(value: TaskFieldValueDto): Coerced {
  return typeof value === "string" ? ok(value.trim()) : fail(FormFieldIssueCode.INVALID_TYPE);
}

function coerceMatching(value: TaskFieldValueDto, pattern: RegExp, code: FormFieldIssueCode): Coerced {
  const coerced = coerceString(value);
  if (!coerced.ok || typeof coerced.value !== "string") return coerced;
  return pattern.test(coerced.value) ? coerced : fail(code);
}

function coerceDate(value: TaskFieldValueDto, pattern: RegExp): Coerced {
  const coerced = coerceMatching(value, pattern, FormFieldIssueCode.INVALID_DATE);
  if (!coerced.ok || typeof coerced.value !== "string") return coerced;
  return Number.isNaN(Date.parse(coerced.value)) ? fail(FormFieldIssueCode.INVALID_DATE) : coerced;
}

function coerceNumber(value: TaskFieldValueDto): Coerced {
  const candidate = typeof value === "string" ? Number(value.trim()) : value;
  return typeof candidate === "number" && Number.isFinite(candidate) ? ok(candidate) : fail(FormFieldIssueCode.INVALID_TYPE);
}

function coercePerson(value: TaskFieldValueDto): Coerced {
  if (typeof value !== "object" || value === null) return fail(FormFieldIssueCode.INVALID_TYPE);
  const name = value.name.trim();
  const email = value.email.trim();
  if (name === "") return fail(FormFieldIssueCode.INVALID_TYPE);
  if (!FORM_VALUE_PATTERN.EMAIL.test(email)) return fail(FormFieldIssueCode.INVALID_EMAIL);
  return ok({ user_id: null, name, email });
}

function coerceSelect(field: TaskFormFieldDto, value: TaskFieldValueDto): Coerced {
  const coerced = coerceString(value);
  if (!coerced.ok) return coerced;
  return field.options.some((option) => option.value === coerced.value) ? coerced : fail(FormFieldIssueCode.NOT_AN_OPTION);
}

function coerceByControl(field: TaskFormFieldDto, value: TaskFieldValueDto): Coerced {
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
      return typeof value === "boolean" ? ok(value) : fail(FormFieldIssueCode.INVALID_TYPE);
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

function lookupBoundValue(bound: string, merged: Readonly<Record<string, TaskFieldValueDto>>): string | null {
  const direct = merged[bound];
  if (typeof direct === "string") return direct;
  if (!isNamespacedFieldId(bound)) {
    const legacy = merged[`${TaskValueNamespace.INPUTS}${FIELD_ID_SEPARATOR}${bound}`];
    if (typeof legacy === "string") return legacy;
  }
  return null;
}

function resolveDateBound(bound: string | null, merged: Readonly<Record<string, TaskFieldValueDto>>, today: string): string | null {
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

function dateIssue(field: TaskFormFieldDto, value: string, merged: Readonly<Record<string, TaskFieldValueDto>>, today: string): FormFieldIssueDto | null {
  const validation = field.validation;
  if (validation === null) return null;
  for (const raw of [validation.not_before, validation.not_before_field]) {
    const bound = resolveDateBound(raw, merged, today);
    if (bound !== null && compareDates(value, bound) < 0) return { field_id: field.id, code: FormFieldIssueCode.BEFORE_EARLIEST_DATE, limit: bound };
  }
  for (const raw of [validation.not_after, validation.not_after_field]) {
    const bound = resolveDateBound(raw, merged, today);
    if (bound !== null && compareDates(value, bound) > 0) return { field_id: field.id, code: FormFieldIssueCode.AFTER_LATEST_DATE, limit: bound };
  }
  return null;
}

function stringIssue(field: TaskFormFieldDto, value: string): FormFieldIssueDto | null {
  const validation = field.validation;
  const maxLength = Math.min(validation?.max_length ?? TASK_FIELD_LIMIT.TEXT_MAX_LENGTH, TASK_FIELD_LIMIT.TEXT_MAX_LENGTH);
  if (validation?.min_length != null && value.length < validation.min_length) {
    return { field_id: field.id, code: FormFieldIssueCode.TOO_SHORT, limit: validation.min_length };
  }
  if (value.length > maxLength) return { field_id: field.id, code: FormFieldIssueCode.TOO_LONG, limit: maxLength };
  if (validation?.pattern != null && !matchesPattern(validation.pattern, value)) {
    return { field_id: field.id, code: FormFieldIssueCode.PATTERN_MISMATCH, limit: null };
  }
  return null;
}

function numberIssue(field: TaskFormFieldDto, value: number): FormFieldIssueDto | null {
  const validation = field.validation;
  if (validation?.min != null && value < validation.min) return { field_id: field.id, code: FormFieldIssueCode.BELOW_MINIMUM, limit: validation.min };
  if (validation?.max != null && value > validation.max) return { field_id: field.id, code: FormFieldIssueCode.ABOVE_MAXIMUM, limit: validation.max };
  return null;
}

function ruleIssue(field: TaskFormFieldDto, value: TaskFieldValueDto, merged: Readonly<Record<string, TaskFieldValueDto>>, today: string): FormFieldIssueDto | null {
  if (typeof value === "number") return numberIssue(field, value);
  if (typeof value !== "string") return null;
  if (DATE_CONTROLS.includes(field.control)) return dateIssue(field, value, merged, today);
  if (TEXT_CONTROLS.includes(field.control)) return stringIssue(field, value);
  return null;
}

export function validateFormDraft(input: ValidateFormDraftInput): FormFieldIssueDto[] {
  const fieldsById = new Map(input.fields.map((field) => [field.id, field]));
  const issues: FormFieldIssueDto[] = [];
  const coercedValues: Record<string, TaskFieldValueDto> = {};

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
      coercedValues[id] = null;
      continue;
    }
    const coerced = coerceByControl(field, raw);
    if (coerced.ok) coercedValues[id] = coerced.value;
    else issues.push({ field_id: id, code: coerced.code, limit: null });
  }

  const merged = { ...input.allValues, ...coercedValues };
  const invalidIds = new Set(issues.map((issue) => issue.field_id));

  for (const field of input.fields) {
    if (field.locked || invalidIds.has(field.id)) continue;
    const provided = Object.prototype.hasOwnProperty.call(coercedValues, field.id);
    const value = merged[field.id] ?? null;
    if (isEmptyFieldValue(value)) {
      if (input.mode === FormValidationMode.SUBMIT && field.required) {
        issues.push({ field_id: field.id, code: FormFieldIssueCode.REQUIRED, limit: null });
      }
      continue;
    }
    if (!provided && input.mode === FormValidationMode.DRAFT) continue;
    const issue = ruleIssue(field, value, merged, input.today);
    if (issue !== null) issues.push(issue);
  }

  return issues;
}

export function taskFieldValues(forms: readonly TaskFormDto[]): Record<string, TaskFieldValueDto> {
  const values: Record<string, TaskFieldValueDto> = {};
  for (const form of forms) for (const section of form.sections) for (const field of section.fields) values[field.id] = field.value;
  return values;
}

export function todayIsoDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
