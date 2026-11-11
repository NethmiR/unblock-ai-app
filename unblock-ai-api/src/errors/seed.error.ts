import { BaseError, type BaseErrorOptions } from "./base.error.js";

export class SeedError extends BaseError {
  readonly statusCode = 500;
  override readonly isOperational = false;

  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message, { code: "SEED_ERROR", ...options });
  }
}
