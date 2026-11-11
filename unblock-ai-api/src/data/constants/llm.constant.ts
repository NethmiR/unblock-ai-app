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
