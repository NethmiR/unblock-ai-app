import { BaseError, type BaseErrorOptions } from "./base.error.js";

export class ValidationError extends BaseError {
  readonly statusCode = 400;

  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message, { code: "VALIDATION_ERROR", ...options });
  }

  static forField(field: string, requirement: string): ValidationError {
    return new ValidationError(`Body must include ${requirement} '${field}' field`);
  }

  static forObject(field: string): ValidationError {
    return new ValidationError(`Body must include a '${field}' object`);
  }
}
