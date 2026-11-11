import type { LlmCompletion, LlmCompletionRequest } from "../../lib/types/ai/llm.type.js";

export interface ILlmAdapter {
  readonly modelName: string;
  generateCompletion(request: LlmCompletionRequest): Promise<LlmCompletion>;
}
