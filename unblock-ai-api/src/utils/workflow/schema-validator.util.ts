import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import { workflowSchema, strictWorkflowSchema } from "../../data/schemas/workflow-schema.data.js";

const addFormats = addFormatsImport as unknown as typeof addFormatsImport.default;

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validateFn = ajv.compile(workflowSchema);

export function validateSchema(workflow: unknown): string[] {
  const valid = validateFn(workflow);
  if (valid) return [];

  return (validateFn.errors ?? []).map((err) => `${err.instancePath || "(root)"} ${err.message}`);
}

export { workflowSchema, strictWorkflowSchema };
