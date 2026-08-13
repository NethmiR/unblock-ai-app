import type { ErrorResponseBody } from "../lib/types/http/http.type.js";

function toScreamingSnakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/Error$/, "")
    .toUpperCase();
}

export interface BaseErrorOptions {
  code?: string;
  details?: unknown;
  cause?: unknown;
}

export abstract class BaseError extends Error {
  abstract readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;
  readonly isOperational: boolean = true;

  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.code = options.code ?? toScreamingSnakeCase(new.target.name);
    this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, new.target);
    }
  }

  toJSON(): ErrorResponseBody {
    return {
      error: this.message,
      code: this.code,
      details: this.details ?? null,
    };
  }
}
