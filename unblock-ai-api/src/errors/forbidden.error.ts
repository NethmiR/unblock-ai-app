import { BaseError, type BaseErrorOptions } from "./base.error.js";

export class ForbiddenError extends BaseError {
  readonly statusCode = 403;

  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message, { code: "FORBIDDEN", ...options });
  }
}
