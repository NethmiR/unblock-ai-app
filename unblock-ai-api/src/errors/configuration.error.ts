import { BaseError, type BaseErrorOptions } from "./base.error.js";

export class ConfigurationError extends BaseError {
  readonly statusCode = 500;
  override readonly isOperational = false;

  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message, { code: "CONFIGURATION_ERROR", ...options });
  }
}
