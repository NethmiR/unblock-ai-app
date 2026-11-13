export enum LlmMessageRole {
  SYSTEM = "system",
  USER = "user",
  ASSISTANT = "assistant",
}

export enum LlmFinishReason {
  STOP = "stop",
  LENGTH = "length",
  CONTENT_FILTER = "content_filter",
  OTHER = "other",
}

export enum LlmOperation {
  WORKFLOW_TEMPLATE_GENERATION = "workflow_template_generation",
  WORKFLOW_SELECTION = "workflow_selection",
}

export const LLM_OPERATIONS: readonly LlmOperation[] = Object.values(LlmOperation);
