import type { LlmFinishReason, LlmMessageRole } from "../../../data/constants/llm.constant.js";

export type LlmConversationRole = Exclude<LlmMessageRole, LlmMessageRole.SYSTEM>;

export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
}

export interface LlmResponseSchema {
  name: string;
  definition: Record<string, unknown>;
}

export interface LlmCompletionRequest {
  messages: LlmMessage[];
  responseSchema?: LlmResponseSchema;
}

export interface LlmTokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface LlmCompletion {
  content: string;
  usage: LlmTokenUsage;
  finishReason: LlmFinishReason | null;
}
