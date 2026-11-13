import { BaseError, type BaseErrorOptions } from "./base.error.js";

export class GoneError extends BaseError {
  readonly statusCode = 410;

  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message, { code: "GONE", ...options });
  }
}
