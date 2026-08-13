import { AzureOpenAI } from "openai";
import { config } from "../config/index.config.js";

// Deliberately separate from chatClient: different endpoint, different key,
// different deployment. Sharing one client would couple two independently
// rotatable credentials.
export const embeddingClient: AzureOpenAI = new AzureOpenAI({
  endpoint: config.azureEmbedding.endpoint,
  apiKey: config.azureEmbedding.apiKey,
  apiVersion: config.azureEmbedding.apiVersion,
  deployment: config.azureEmbedding.deployment,
});
