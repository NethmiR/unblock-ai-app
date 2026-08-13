export const EMBEDDING_MODEL_ID = "text-embedding-3-small";

export const REASONING_MODEL_PATTERN: RegExp = /^(o\d|gpt-5)/i;

export function supportsTemperatureControl(deployment: string): boolean {
  return !REASONING_MODEL_PATTERN.test(deployment);
}
