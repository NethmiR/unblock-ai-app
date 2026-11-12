import { ApiError } from "./client";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function apiErrorCode(err: unknown): string | null {
  return err instanceof ApiError ? (err.code ?? null) : null;
}

export function apiErrorDetails(err: unknown): Record<string, unknown> | null {
  return err instanceof ApiError && isRecord(err.details) ? err.details : null;
}

export function apiErrorField(err: unknown): string | null {
  const field = apiErrorDetails(err)?.field;
  return typeof field === "string" ? field : null;
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}
