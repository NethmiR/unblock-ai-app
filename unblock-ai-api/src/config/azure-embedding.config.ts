import { rawEnv } from "./env.config.js";
import { optionalString, parseNumber, requireString } from "../utils/shared/env-parse.util.js";
import type { AzureEmbeddingConfig } from "../lib/types/config/config.type.js";

export const azureEmbedding: AzureEmbeddingConfig = Object.freeze({
  endpoint: requireString("AZURE_EMBEDDING_ENDPOINT", rawEnv.AZURE_EMBEDDING_ENDPOINT),
  apiKey: requireString("AZURE_EMBEDDING_API_KEY", rawEnv.AZURE_EMBEDDING_API_KEY),
  deployment: optionalString(
    "AZURE_EMBEDDING_DEPLOYMENT",
    rawEnv.AZURE_EMBEDDING_DEPLOYMENT,
    "text-embedding-3-small",
  ),
  apiVersion: optionalString("AZURE_EMBEDDING_API_VERSION", rawEnv.AZURE_EMBEDDING_API_VERSION, "2024-10-21"),
  dimensions: parseNumber("AZURE_EMBEDDING_DIM", rawEnv.AZURE_EMBEDDING_DIM, 1536),
});
