import { Ajv2020 } from "ajv/dist/2020.js";

export type JsonSchemaGuard<T> = (value: unknown) => value is T;

const ajv = new Ajv2020({ strict: true, allowUnionTypes: true });

export function createJsonSchemaGuard<T>(schema: Record<string, unknown>): JsonSchemaGuard<T> {
  const validate = ajv.compile<T>(schema);
  return (value: unknown): value is T => validate(value);
}
