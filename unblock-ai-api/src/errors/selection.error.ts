import { BaseError, type BaseErrorOptions } from "./base.error.js";

export class SelectionError extends BaseError {
  readonly statusCode = 502;

  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message, { code: "SELECTION_ERROR", ...options });
  }
}
