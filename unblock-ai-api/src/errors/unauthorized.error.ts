import { BaseError, type BaseErrorOptions } from "./base.error.js";

export class UnauthorizedError extends BaseError {
  readonly statusCode = 401;

  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message, { code: "UNAUTHORIZED", ...options });
  }
}
