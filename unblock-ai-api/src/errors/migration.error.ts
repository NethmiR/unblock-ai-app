import { BaseError, type BaseErrorOptions } from "./base.error.js";

export class MigrationError extends BaseError {
  readonly statusCode = 500;
  override readonly isOperational = false;

  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message, { code: "MIGRATION_ERROR", ...options });
  }
}
