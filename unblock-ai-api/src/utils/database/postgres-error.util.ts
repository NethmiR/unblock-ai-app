import type { PostgresConstraint, PostgresErrorCode } from "../../data/constants/postgres.constant.js";

interface PostgresDriverError {
  code?: unknown;
  constraint?: unknown;
}

export function isPostgresError(err: unknown, code: PostgresErrorCode, constraint?: PostgresConstraint): boolean {
  for (let current: unknown = err; current; current = current instanceof Error ? current.cause : undefined) {
    const candidate = current as PostgresDriverError;
    if (candidate.code === code && (constraint === undefined || candidate.constraint === constraint)) return true;
  }
  return false;
}
