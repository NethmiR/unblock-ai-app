import { rawEnv } from "./env.config.js";
import { parseEnum, requireString } from "../utils/shared/env-parse.util.js";
import { LLM_PROVIDERS, AiProvider } from "../data/constants/ai-provider.constant.js";
import type { LlmConfig } from "../lib/types/config/config.type.js";

function readLlmConfig(): LlmConfig {
  const provider = parseEnum("LLM_PROVIDER", rawEnv.LLM_PROVIDER, LLM_PROVIDERS, AiProvider.AZURE_OPENAI);

  if (provider === AiProvider.GEMINI) {
    return {
      provider,
      gemini: {
        apiKey: requireString("GEMINI_API_KEY", rawEnv.GEMINI_API_KEY),
        model: requireString("GEMINI_CHAT_MODEL", rawEnv.GEMINI_CHAT_MODEL),
      },
    };
  }

  return {
    provider,
    azureOpenAI: {
      endpoint: requireString("AZURE_OPENAI_ENDPOINT", rawEnv.AZURE_OPENAI_ENDPOINT),
      apiKey: requireString("AZURE_OPENAI_API_KEY", rawEnv.AZURE_OPENAI_API_KEY),
      apiVersion: requireString("AZURE_OPENAI_API_VERSION", rawEnv.AZURE_OPENAI_API_VERSION),
      deployment: requireString("AZURE_OPENAI_CHAT_DEPLOYMENT", rawEnv.AZURE_OPENAI_CHAT_DEPLOYMENT),
    },
  };
}

export const llm: LlmConfig = Object.freeze(readLlmConfig());
