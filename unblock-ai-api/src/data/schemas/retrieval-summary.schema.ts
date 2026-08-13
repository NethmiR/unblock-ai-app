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
