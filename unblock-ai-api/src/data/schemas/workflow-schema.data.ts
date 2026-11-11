import workflowSchemaJson from "./workflow.schema.json" with { type: "json" };
import type { LlmResponseSchema } from "../../lib/types/ai/llm.type.js";

export const workflowSchema: Record<string, unknown> = workflowSchemaJson;

export const strictWorkflowSchema: Record<string, unknown> = JSON.parse(JSON.stringify(workflowSchemaJson));

export const workflowResponseSchema: LlmResponseSchema = {
  name: "workflow_definition",
  definition: strictWorkflowSchema,
};
