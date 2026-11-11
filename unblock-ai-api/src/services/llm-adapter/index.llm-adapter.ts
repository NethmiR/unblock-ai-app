import { AzureOpenAILlmAdapter } from "./azure-openai.llm-adapter.js";
import { GeminiLlmAdapter } from "./gemini.llm-adapter.js";
import { AiProvider } from "../../data/constants/ai-provider.constant.js";
import type { ILlmAdapter } from "./llm-adapter.interface.js";
import type { LlmConfig } from "../../lib/types/config/config.type.js";

export { AzureOpenAILlmAdapter } from "./azure-openai.llm-adapter.js";
export { GeminiLlmAdapter } from "./gemini.llm-adapter.js";
export type { ILlmAdapter } from "./llm-adapter.interface.js";

export function createLlmAdapter(llmConfig: LlmConfig): ILlmAdapter {
  switch (llmConfig.provider) {
    case AiProvider.AZURE_OPENAI:
      return new AzureOpenAILlmAdapter({ config: llmConfig.azureOpenAI });
    case AiProvider.GEMINI:
      return new GeminiLlmAdapter({ config: llmConfig.gemini });
  }
}
