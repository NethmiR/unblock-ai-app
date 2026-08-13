import { BaseError, type BaseErrorOptions } from "./base.error.js";

export class ConflictError extends BaseError {
  readonly statusCode = 409;

  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message, { code: "CONFLICT", ...options });
  }
}
