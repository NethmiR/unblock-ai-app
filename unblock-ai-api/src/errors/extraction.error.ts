import { BaseError, type BaseErrorOptions } from "./base.error.js";

export class ExtractionError extends BaseError {
  readonly statusCode = 422;

  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message, { code: "EXTRACTION_ERROR", ...options });
  }
}
