import { AzureOpenAILlmAdapter } from "./azure-openai.llm-adapter.js";
import { GeminiLlmAdapter } from "./gemini.llm-adapter.js";
import { UsageLoggingLlmAdapter } from "./usage-logging.llm-adapter.js";
import { AiProvider } from "../../data/constants/ai-provider.constant.js";
import { LlmOperation } from "../../data/constants/llm.constant.js";
import type { ILlmAdapter } from "./llm-adapter.interface.js";
import type { AiProviderConnectionConfig, LlmConfig } from "../../lib/types/config/config.type.js";

export { AzureOpenAILlmAdapter } from "./azure-openai.llm-adapter.js";
export { GeminiLlmAdapter } from "./gemini.llm-adapter.js";
export { UsageLoggingLlmAdapter } from "./usage-logging.llm-adapter.js";
export type { ILlmAdapter } from "./llm-adapter.interface.js";

export type LlmAdapters = Readonly<Record<LlmOperation, ILlmAdapter>>;

export function createLlmAdapter(connection: AiProviderConnectionConfig): ILlmAdapter {
  switch (connection.provider) {
    case AiProvider.AZURE_OPENAI:
      return new AzureOpenAILlmAdapter({ config: connection.azureOpenAI });
    case AiProvider.GEMINI:
      return new GeminiLlmAdapter({ config: connection.gemini });
  }
}

function defaultModelOf(connection: AiProviderConnectionConfig): string {
  switch (connection.provider) {
    case AiProvider.AZURE_OPENAI:
      return connection.azureOpenAI.deployment;
    case AiProvider.GEMINI:
      return connection.gemini.model;
  }
}

function withModel(connection: AiProviderConnectionConfig, model: string): AiProviderConnectionConfig {
  switch (connection.provider) {
    case AiProvider.AZURE_OPENAI:
      return { provider: connection.provider, azureOpenAI: { ...connection.azureOpenAI, deployment: model } };
    case AiProvider.GEMINI:
      return { provider: connection.provider, gemini: { ...connection.gemini, model } };
  }
}

export function createLlmAdapters(
  llmConfig: LlmConfig,
  buildAdapter: (connection: AiProviderConnectionConfig) => ILlmAdapter = createLlmAdapter,
): LlmAdapters {
  const byModel = new Map<string, ILlmAdapter>();
  const adapterFor = (model: string): ILlmAdapter => {
    const existing = byModel.get(model);
    if (existing) return existing;
    const adapter = new UsageLoggingLlmAdapter({ adapter: buildAdapter(withModel(llmConfig, model)) });
    byModel.set(model, adapter);
    return adapter;
  };
  const defaultModel = defaultModelOf(llmConfig);
  const forOperation = (operation: LlmOperation): ILlmAdapter => adapterFor(llmConfig.operationModels[operation] ?? defaultModel);
  const adapters: Record<LlmOperation, ILlmAdapter> = {
    [LlmOperation.WORKFLOW_TEMPLATE_GENERATION]: forOperation(LlmOperation.WORKFLOW_TEMPLATE_GENERATION),
    [LlmOperation.WORKFLOW_SELECTION]: forOperation(LlmOperation.WORKFLOW_SELECTION),
  };
  return Object.freeze(adapters);
}
