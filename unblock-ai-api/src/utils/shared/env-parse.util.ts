import { ConfigurationError } from "../../errors/configuration.error.js";

export function requireString(name: string, raw: string | undefined): string {
  if (raw === undefined || raw === "") {
    throw new ConfigurationError(`Missing required environment variable: ${name}`);
  }
  return raw;
}

export function optionalString(
  name: string,
  raw: string | undefined,
  fallback: string,
): string {
  if (raw === undefined || raw === "") return fallback;
  return raw;
}

export function parseNumber(
  name: string,
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new ConfigurationError(`Environment variable ${name} must be numeric, got: ${raw}`);
  }
  return parsed;
}

export function parseBoolean(
  name: string,
  raw: string | undefined,
  fallback: boolean,
): boolean {
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ConfigurationError(`Environment variable ${name} must be "true" or "false", got: ${raw}`);
}

export function parseEnum<T extends string>(
  name: string,
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (raw === undefined || raw === "") return fallback;
  if (!allowed.includes(raw as T)) {
    throw new ConfigurationError(
      `Environment variable ${name} must be one of [${allowed.join(", ")}], got: ${raw}`,
    );
  }
  return raw as T;
}
