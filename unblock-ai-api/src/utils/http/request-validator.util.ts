import { ValidationError } from "../../errors/validation.error.js";
import { UUID_PATTERN } from "../../data/constants/identifier.constant.js";
import { QueryBooleanValue } from "../../data/constants/http.constant.js";

function readField(body: unknown, field: string): unknown {
  return (body as Record<string, unknown> | null | undefined)?.[field];
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export function requireNonEmptyString(body: unknown, field: string, message?: string): string {
  const value = readField(body, field);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(message ?? `Body must include a non-empty '${field}' field`);
  }
  return value;
}

export function requireObject<T>(body: unknown, field: string): T {
  const value = readField(body, field);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw ValidationError.forObject(field);
  }
  return value as T;
}

export function requireOneOf<T extends string>(body: unknown, field: string, allowed: readonly T[]): T {
  const value = readField(body, field);
  if (!isOneOf(value, allowed)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

export function optionalOneOf<T extends string>(body: unknown, field: string, allowed: readonly T[]): T | undefined {
  return readField(body, field) === undefined ? undefined : requireOneOf(body, field, allowed);
}

export function requireOneOfArray<T extends string>(body: unknown, field: string, allowed: readonly T[]): T[] {
  const value = readField(body, field);
  if (!Array.isArray(value) || !value.every((item) => isOneOf(item, allowed))) {
    throw new ValidationError(`${field} must be an array whose items are each one of: ${allowed.join(", ")}`);
  }
  return value;
}

export function optionalOneOfArray<T extends string>(body: unknown, field: string, allowed: readonly T[]): T[] | undefined {
  return readField(body, field) === undefined ? undefined : requireOneOfArray(body, field, allowed);
}

export function optionalString(body: unknown, field: string): string | null {
  const value = readField(body, field);
  if (value === undefined || value === null) return null;
  return String(value);
}

export function optionalNonEmptyString(body: unknown, field: string): string | undefined {
  return readField(body, field) === undefined ? undefined : requireNonEmptyString(body, field);
}

export function optionalNullableString(body: unknown, field: string): string | null | undefined {
  const value = readField(body, field);
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") throw ValidationError.forField(field, "a string or null");
  return value;
}

export function optionalNullableUuid(body: unknown, field: string): string | null | undefined {
  const value = readField(body, field);
  if (value === undefined || value === null) return value;
  return requireUuid(value, field);
}

export function requireBoolean(body: unknown, field: string): boolean {
  const value = readField(body, field);
  if (typeof value !== "boolean") throw ValidationError.forField(field, "a boolean");
  return value;
}

export function optionalBoolean(body: unknown, field: string): boolean | undefined {
  return readField(body, field) === undefined ? undefined : requireBoolean(body, field);
}

export function requireInteger(body: unknown, field: string): number {
  const value = readField(body, field);
  if (typeof value !== "number" || !Number.isInteger(value)) throw ValidationError.forField(field, "an integer");
  return value;
}

export function optionalInteger(body: unknown, field: string): number | undefined {
  return readField(body, field) === undefined ? undefined : requireInteger(body, field);
}

export function optionalObject<T>(body: unknown, field: string): T | null {
  const value = readField(body, field);
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw ValidationError.forObject(field);
  }
  return value as T;
}

export function requireObjectArray(body: unknown, field: string): unknown[] {
  const value = readField(body, field);
  if (!Array.isArray(value) || !value.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))) {
    throw new ValidationError(`Body must include a '${field}' array of objects`);
  }
  return value;
}

export function optionalPositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${field} must be a positive integer`);
  }
  return parsed;
}

export function requireStringArray(body: unknown, field: string): string[] {
  const value = readField(body, field);
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === "string")) {
    throw new ValidationError(`Body must include a '${field}' array of strings`);
  }
  return value;
}

export function requireUuidArray(body: unknown, field: string, label: string = field): string[] {
  const value = readField(body, field);
  if (!Array.isArray(value) || !value.every(isUuid)) {
    throw new ValidationError(`${label} must be an array of valid UUIDs`);
  }
  return value;
}

export function requireUuidField(body: unknown, field: string, label: string = field): string {
  return requireUuid(readField(body, field), label);
}

export function requireUuid(value: unknown, field: string): string {
  if (!isUuid(value)) {
    throw new ValidationError(`${field} must be a valid UUID`);
  }
  return value;
}

export function parseBooleanQuery(value: unknown, field: string): boolean {
  if (value === undefined) return false;
  if (value === QueryBooleanValue.TRUE) return true;
  if (value === QueryBooleanValue.FALSE) return false;
  throw new ValidationError(`${field} must be '${QueryBooleanValue.TRUE}' or '${QueryBooleanValue.FALSE}'`);
}

export function parseOptionalUuidQuery(value: unknown, field: string): string | null {
  return value === undefined ? null : requireUuid(value, field);
}

export function parseOptionalOneOfQuery<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | null {
  if (value === undefined) return null;
  if (!isOneOf(value, allowed)) throw new ValidationError(`${field} must be one of: ${allowed.join(", ")}`);
  return value;
}

export function parseOptionalStringQuery(value: unknown, field: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") throw new ValidationError(`${field} must be a single string value`);
  return value;
}

export function parseIntegerQuery(value: unknown, field: string, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed)) throw new ValidationError(`${field} must be an integer`);
  return parsed;
}
