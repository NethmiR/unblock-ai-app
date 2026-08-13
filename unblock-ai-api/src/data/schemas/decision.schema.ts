export const decisionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "workflow_id", "confidence", "question", "options", "reasoning"],
  properties: {
    decision: {
      type: "string",
      enum: ["matched", "ambiguous", "no_match"],
    },
    workflow_id: {
      type: ["string", "null"],
      description: "Set ONLY when decision is 'matched'. Must be one of the given candidate ids.",
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
    reasoning: {
      type: "string",
      description: "Logged for debugging. NEVER shown to the user.",
    },
  },
} as const;

export const DECISION_SCHEMA_NAME = "workflow_selection_decision";
