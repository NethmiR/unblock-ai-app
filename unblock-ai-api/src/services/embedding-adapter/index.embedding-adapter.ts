import { AzureOpenAIEmbeddingAdapter } from "./azure-openai.embedding-adapter.js";
import { GeminiEmbeddingAdapter } from "./gemini.embedding-adapter.js";
import { AiProvider } from "../../data/constants/ai-provider.constant.js";
import type { IEmbeddingAdapter } from "./embedding-adapter.interface.js";
import type { EmbeddingConfig } from "../../lib/types/config/config.type.js";

export { AzureOpenAIEmbeddingAdapter } from "./azure-openai.embedding-adapter.js";
export { GeminiEmbeddingAdapter } from "./gemini.embedding-adapter.js";
export type { IEmbeddingAdapter } from "./embedding-adapter.interface.js";

export function createEmbeddingAdapter(embeddingConfig: EmbeddingConfig): IEmbeddingAdapter {
  switch (embeddingConfig.provider) {
    case AiProvider.AZURE_OPENAI:
      return new AzureOpenAIEmbeddingAdapter({
        config: embeddingConfig.azureOpenAI,
        dimensions: embeddingConfig.dimensions,
      });
    case AiProvider.GEMINI:
      return new GeminiEmbeddingAdapter({
        config: embeddingConfig.gemini,
        dimensions: embeddingConfig.dimensions,
      });
  }
}
