import { BaseError, type BaseErrorOptions } from "./base.error.js";

export class EmbeddingError extends BaseError {
  readonly statusCode = 502;

  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message, { code: "EMBEDDING_ERROR", ...options });
  }
}
