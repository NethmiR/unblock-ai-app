import { ValidationError } from "../../errors/validation.error.js";

export function requireNonEmptyString(body: unknown, field: string, message?: string): string {
  const value = (body as Record<string, unknown> | null | undefined)?.[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(message ?? `Body must include a non-empty '${field}' field`);
  }
  return value;
}

export function requireObject<T>(body: unknown, field: string): T {
  const value = (body as Record<string, unknown> | null | undefined)?.[field];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw ValidationError.forObject(field);
  }
  return value as T;
}

export function requireOneOf<T extends string>(body: unknown, field: string, allowed: readonly T[]): T {
  const value = (body as Record<string, unknown> | null | undefined)?.[field];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function optionalString(body: unknown, field: string): string | null {
  const value = (body as Record<string, unknown> | null | undefined)?.[field];
  if (value === undefined || value === null) return null;
  return String(value);
}

export function optionalObject<T>(body: unknown, field: string): T | null {
  const value = (body as Record<string, unknown> | null | undefined)?.[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw ValidationError.forObject(field);
  }
  return value as T;
}

export function optionalPositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${field} must be a positive integer`);
  }
  return parsed;
}
