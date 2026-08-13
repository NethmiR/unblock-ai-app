import { AzureOpenAI } from "openai";
import { config } from "../config/index.config.js";

export function createChatClient(deployment: string): AzureOpenAI {
  return new AzureOpenAI({
    endpoint: config.azureOpenAI.endpoint,
    apiKey: config.azureOpenAI.apiKey,
    apiVersion: config.azureOpenAI.apiVersion,
    deployment,
  });
}

export const chatClient: AzureOpenAI = createChatClient(config.azureOpenAI.deployment);

// The SDK builds the request URL from the constructor's deployment and ignores
// the body's `model`, so a shared client would silently misroute selector
// calls to the extraction deployment. Two instances keep the config seam real.
export const selectorChatClient: AzureOpenAI = createChatClient(config.azureOpenAI.selectorDeployment);
