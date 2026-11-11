import { BaseError } from "../../errors/base.error.js";

export function describeError(err: unknown): string {
  const messages: string[] = [];
  for (let current: unknown = err; current; current = current instanceof Error ? current.cause : undefined) {
    messages.push(current instanceof Error ? current.message : String(current));
  }
  const details = err instanceof BaseError && err.details ? `\n  details: ${JSON.stringify(err.details)}` : "";
  return `${messages.join("\n  caused by: ")}${details}`;
}
