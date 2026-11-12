import { BaseError } from "../../src/errors/base.error.js";

export function withErrorCode(code: string): (err: unknown) => boolean {
  return (err: unknown): boolean => err instanceof BaseError && err.code === code;
}
