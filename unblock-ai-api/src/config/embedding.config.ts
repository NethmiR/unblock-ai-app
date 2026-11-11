import { rawEnv } from "./env.config.js";
import { parseEnum, parseNumber, requireString } from "../utils/shared/env-parse.util.js";
import { AI_PROVIDERS, AiProvider } from "../data/constants/ai-provider.constant.js";
import type { EmbeddingConfig } from "../lib/types/config/config.type.js";

function readEmbeddingConfig(): EmbeddingConfig {
  const provider = parseEnum("EMBEDDING_PROVIDER", rawEnv.EMBEDDING_PROVIDER, AI_PROVIDERS, AiProvider.AZURE_OPENAI);
  const dimensions = parseNumber("EMBEDDING_DIMENSIONS", rawEnv.EMBEDDING_DIMENSIONS, 1536);

  if (provider === AiProvider.GEMINI) {
    return {
      provider,
      dimensions,
      gemini: {
        apiKey: requireString("GEMINI_API_KEY", rawEnv.GEMINI_API_KEY),
        model: requireString("GEMINI_EMBEDDING_MODEL", rawEnv.GEMINI_EMBEDDING_MODEL),
      },
    };
  }

  return {
    provider,
    dimensions,
    azureOpenAI: {
      endpoint: requireString("AZURE_OPENAI_EMBEDDING_ENDPOINT", rawEnv.AZURE_OPENAI_EMBEDDING_ENDPOINT),
      apiKey: requireString("AZURE_OPENAI_EMBEDDING_API_KEY", rawEnv.AZURE_OPENAI_EMBEDDING_API_KEY),
      apiVersion: requireString("AZURE_OPENAI_EMBEDDING_API_VERSION", rawEnv.AZURE_OPENAI_EMBEDDING_API_VERSION),
      deployment: requireString("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", rawEnv.AZURE_OPENAI_EMBEDDING_DEPLOYMENT),
    },
  };
}

export const embedding: EmbeddingConfig = Object.freeze(readEmbeddingConfig());
