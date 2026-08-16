import type { TaskRequirement } from "../../lib/types/task/requirement.type.js";
import type { RequirementValue, PersonValue } from "../../lib/types/task/requirement.type.js";
import { ValidationError } from "../../errors/validation.error.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveDateBound(bound: string, allValues: Record<string, RequirementValue>): string | null {
  if (bound === "today") {
    return new Date().toISOString().slice(0, 10);
  }
  if (bound.startsWith("inputs.")) {
    const fieldKey = bound.slice("inputs.".length);
    const fieldValue = allValues[fieldKey];
    return typeof fieldValue === "string" ? fieldValue : null;
  }
  return bound;
}

function coerceDate(requirement: TaskRequirement, value: unknown): string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`Requirement '${requirement.key}' expects a date in YYYY-MM-DD format`);
  }
  return value;
}

function coerceNumber(requirement: TaskRequirement, value: unknown): number {
  const num = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num)) {
    throw new ValidationError(`Requirement '${requirement.key}' expects a finite number`);
  }
  return num;
}

function coerceEmail(requirement: TaskRequirement, value: unknown): string {
  if (typeof value !== "string" || !EMAIL_PATTERN.test(value)) {
    throw new ValidationError(`Requirement '${requirement.key}' expects a valid email address`);
  }
  return value;
}

function coerceBoolean(requirement: TaskRequirement, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new ValidationError(`Requirement '${requirement.key}' expects a boolean`);
  }
  return value;
}

function coercePerson(requirement: TaskRequirement, value: unknown): PersonValue {
  if (!isPlainObject(value) || typeof value.name !== "string" || value.name.trim() === "") {
    throw new ValidationError(`Requirement '${requirement.key}' expects a person with a non-empty 'name'`);
  }
  if (typeof value.email !== "string" || !EMAIL_PATTERN.test(value.email)) {
    throw new ValidationError(`Requirement '${requirement.key}' expects a person with a valid 'email'`);
  }
  return { name: value.name, email: value.email };
}

function coerceString(requirement: TaskRequirement, value: unknown): string {
  if (typeof value !== "string") {
    throw new ValidationError(`Requirement '${requirement.key}' expects a string`);
  }
  return value;
}

function coerceByType(requirement: TaskRequirement, value: unknown): RequirementValue {
  switch (requirement.type) {
    case "date":
    case "datetime":
      return coerceDate(requirement, value);
    case "number":
      return coerceNumber(requirement, value);
    case "email":
      return coerceEmail(requirement, value);
    case "boolean":
      return coerceBoolean(requirement, value);
    case "person":
      return coercePerson(requirement, value);
    case "string":
    case "text":
    case "phone":
    case "enum":
    case "file":
      return coerceString(requirement, value);
    default:
      return coerceString(requirement, value);
  }
}

function applyDateValidation(
  requirement: TaskRequirement,
  value: string,
  allValues: Record<string, RequirementValue>,
): void {
  const { validation } = requirement;
  if (!validation) return;

  if (validation.not_before) {
    const bound = resolveDateBound(validation.not_before, allValues);
    if (bound && value < bound) {
      throw new ValidationError(`Requirement '${requirement.key}' must not be before ${bound}`);
    }
  }
  if (validation.not_after) {
    const bound = resolveDateBound(validation.not_after, allValues);
    if (bound && value > bound) {
      throw new ValidationError(`Requirement '${requirement.key}' must not be after ${bound}`);
    }
  }
  if (validation.not_before_field) {
    const bound = resolveDateBound(validation.not_before_field, allValues);
    if (bound && value < bound) {
      throw new ValidationError(
        `Requirement '${requirement.key}' must not be before '${validation.not_before_field}'`,
      );
    }
  }
  if (validation.not_after_field) {
    const bound = resolveDateBound(validation.not_after_field, allValues);
    if (bound && value > bound) {
      throw new ValidationError(
        `Requirement '${requirement.key}' must not be after '${validation.not_after_field}'`,
      );
    }
  }
}

function applyValidation(
  requirement: TaskRequirement,
  value: RequirementValue,
  allValues: Record<string, RequirementValue>,
): void {
  const { validation } = requirement;
  if (!validation) return;

  if (typeof value === "string") {
    if (validation.min_length != null && value.length < validation.min_length) {
      throw new ValidationError(`Requirement '${requirement.key}' must be at least ${validation.min_length} characters`);
    }
    if (validation.max_length != null && value.length > validation.max_length) {
      throw new ValidationError(`Requirement '${requirement.key}' must be at most ${validation.max_length} characters`);
    }
    if (validation.pattern != null && !new RegExp(validation.pattern).test(value)) {
      throw new ValidationError(`Requirement '${requirement.key}' does not match the required pattern`);
    }
    if (requirement.type === "date" || requirement.type === "datetime") {
      applyDateValidation(requirement, value, allValues);
    }
  }

  if (typeof value === "number") {
    if (validation.min != null && value < validation.min) {
      throw new ValidationError(`Requirement '${requirement.key}' must be at least ${validation.min}`);
    }
    if (validation.max != null && value > validation.max) {
      throw new ValidationError(`Requirement '${requirement.key}' must be at most ${validation.max}`);
    }
  }
}

export function validateValue(
  requirement: TaskRequirement,
  value: unknown,
  allValues: Record<string, RequirementValue>,
): RequirementValue {
  if (value === null) {
    if (requirement.required) {
      throw new ValidationError(`Requirement '${requirement.key}' is required and cannot be null`);
    }
    return null;
  }

  const coerced = coerceByType(requirement, value);
  applyValidation(requirement, coerced, allValues);
  return coerced;
}
