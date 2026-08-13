import workflowSchemaJson from "./workflow.schema.json" with { type: "json" };

export const workflowSchema: Record<string, unknown> = workflowSchemaJson;

export const strictWorkflowSchema: Record<string, unknown> = JSON.parse(JSON.stringify(workflowSchemaJson));
