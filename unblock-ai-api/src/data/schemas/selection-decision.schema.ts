import { createJsonSchemaGuard } from "../../utils/shared/json-schema-guard.util.js";
import { SELECTOR_DECISION_KINDS } from "../constants/selection.constant.js";
import type { LlmResponseSchema } from "../../lib/types/ai/llm.type.js";
import type { SelectorDecision } from "../../lib/types/selection/decision.type.js";

export const selectionDecisionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "workflow_template_id", "confidence", "question", "options", "matched_fact_ids", "reasoning"],
  properties: {
    decision: {
      type: "string",
      enum: [...SELECTOR_DECISION_KINDS],
    },
    workflow_template_id: {
      type: ["string", "null"],
      description: "Set ONLY when decision is 'matched' or 'start_requested'. Must be one of the given candidate ids.",
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    question: {
      type: ["string", "null"],
      description: "Set ONLY when decision is 'ambiguous'. Exactly one question.",
    },
    options: {
      type: "array",
      items: { type: "string" },
      description: "User-facing answer options for `question`. Empty array when not ambiguous.",
    },
    matched_fact_ids: {
      type: "array",
      items: { type: "string" },
      description: "Ids of the requester profile facts (P1, P2, ...) that decided the match. Only ids that were given.",
    },
    reasoning: {
      type: "string",
      description: "Logged for debugging. NEVER shown to the user.",
    },
  },
} as const;

export const selectionDecisionResponseSchema: LlmResponseSchema = {
  name: "workflow_selection_decision",
  definition: selectionDecisionSchema,
};

export const isSelectorDecision = createJsonSchemaGuard<SelectorDecision>(selectionDecisionSchema);
