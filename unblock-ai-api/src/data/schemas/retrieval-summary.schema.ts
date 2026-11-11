import { createJsonSchemaGuard } from "../../utils/shared/json-schema-guard.util.js";
import type { LlmResponseSchema } from "../../lib/types/ai/llm.type.js";
import type { RetrievalSummary } from "../../lib/types/workflow/retrieval-summary.type.js";

export const retrievalSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["one_liner", "aliases", "keywords", "requester_types", "triggers", "not_for"],
  properties: {
    one_liner: { type: "string" },
    aliases: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } },
    requester_types: { type: "array", items: { type: "string" } },
    triggers: { type: "array", items: { type: "string" } },
    not_for: { type: "array", items: { type: "string" } },
  },
} as const;

export const retrievalSummaryResponseSchema: LlmResponseSchema = {
  name: "retrieval_summary",
  definition: retrievalSummarySchema,
};

export const isRetrievalSummary = createJsonSchemaGuard<RetrievalSummary>(retrievalSummarySchema);
