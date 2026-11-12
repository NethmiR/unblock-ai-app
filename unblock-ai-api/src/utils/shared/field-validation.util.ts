import { ValidationError } from "../../errors/validation.error.js";

export function requireTextLength(value: string, field: string, maxLength: number): string {
  if (value.length === 0 || value.length > maxLength) {
    throw new ValidationError(`${field} must contain between 1 and ${maxLength} characters`, { details: { field } });
  }
  return value;
}

export function requireOptionalTextLength(value: string | null, field: string, maxLength: number): string | null {
  if (value !== null && value.length > maxLength) {
    throw new ValidationError(`${field} must contain at most ${maxLength} characters`, { details: { field } });
  }
  return value;
}

export function requireIntegerInRange(value: number, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${field} must be an integer between ${min} and ${max}`, { details: { field } });
  }
  return value;
}

export function requireMatchingFormat(value: string, field: string, isValid: (value: string) => boolean, requirement: string): string {
  if (!isValid(value)) {
    throw new ValidationError(`${field} must be ${requirement}`, { details: { field } });
  }
  return value;
}
