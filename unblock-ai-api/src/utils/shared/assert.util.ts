import { BaseError } from "../../errors/base.error.js";
import { ValidationError } from "../../errors/validation.error.js";

export function assertDefined<T>(value: T | null | undefined, error: BaseError): asserts value is T {
  if (value === null || value === undefined) {
    throw error;
  }
}

export function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw ValidationError.forField(field, "a non-empty");
  }
}
