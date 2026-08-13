import { BaseError, type BaseErrorOptions } from "./base.error.js";

export class DatabaseError extends BaseError {
  readonly statusCode = 500;
  override readonly isOperational = true;

  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message, { code: "DATABASE_ERROR", ...options });
  }
}
