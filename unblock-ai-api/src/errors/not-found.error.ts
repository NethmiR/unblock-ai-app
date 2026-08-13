import { BaseError, type BaseErrorOptions } from "./base.error.js";

export class NotFoundError extends BaseError {
  readonly statusCode = 404;

  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message, { code: "NOT_FOUND", ...options });
  }

  static of(resource: string, id: string): NotFoundError {
    return new NotFoundError(`${resource} '${id}' not found`);
  }
}
