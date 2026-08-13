import { rawEnv } from "./env.config.js";
import { optionalString, parseNumber, requireString } from "../utils/shared/env-parse.util.js";
import type { AzureOpenAIConfig } from "../lib/types/config/config.type.js";

const deployment = requireString("AZURE_OPENAI_DEPLOYMENT", rawEnv.AZURE_OPENAI_DEPLOYMENT);

export const azureOpenAI: AzureOpenAIConfig = Object.freeze({
  endpoint: requireString("AZURE_OPENAI_ENDPOINT", rawEnv.AZURE_OPENAI_ENDPOINT),
  apiKey: requireString("AZURE_OPENAI_API_KEY", rawEnv.AZURE_OPENAI_API_KEY),
  deployment,
  apiVersion: requireString("AZURE_OPENAI_API_VERSION", rawEnv.AZURE_OPENAI_API_VERSION),
  selectorDeployment: optionalString(
    "AZURE_SELECTOR_DEPLOYMENT",
    rawEnv.AZURE_SELECTOR_DEPLOYMENT,
    deployment,
  ),
  maxExtractionAttempts: parseNumber(
    "EXTRACTION_MAX_ATTEMPTS",
    rawEnv.EXTRACTION_MAX_ATTEMPTS,
    3,
  ),
});
