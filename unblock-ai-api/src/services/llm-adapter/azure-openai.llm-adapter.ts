import { AzureOpenAI } from "openai";
import type { ChatCompletion, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { LlmFinishReason, LlmMessageRole } from "../../data/constants/llm.constant.js";
import type { ILlmAdapter } from "./llm-adapter.interface.js";
import type { LlmCompletion, LlmCompletionRequest, LlmMessage } from "../../lib/types/ai/llm.type.js";
import type { AzureOpenAIConnectionConfig } from "../../lib/types/config/config.type.js";

const REASONING_MODEL_PATTERN = /^(o\d|gpt-5)/i;

enum AzureChatMessageRole {
  SYSTEM = "system",
  USER = "user",
  ASSISTANT = "assistant",
}

type AzureFinishReason = ChatCompletion.Choice["finish_reason"];

const LLM_FINISH_REASON_BY_AZURE_FINISH_REASON: Readonly<Record<AzureFinishReason, LlmFinishReason>> = {
  stop: LlmFinishReason.STOP,
  length: LlmFinishReason.LENGTH,
  content_filter: LlmFinishReason.CONTENT_FILTER,
  tool_calls: LlmFinishReason.OTHER,
  function_call: LlmFinishReason.OTHER,
};

export interface AzureOpenAILlmAdapterOptions {
  config: AzureOpenAIConnectionConfig;
  client?: AzureOpenAI;
}

export class AzureOpenAILlmAdapter implements ILlmAdapter {
  readonly modelName: string;
  private readonly client: AzureOpenAI;

  constructor({ config, client }: AzureOpenAILlmAdapterOptions) {
    this.modelName = config.deployment;
    this.client =
      client ??
      new AzureOpenAI({
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        apiVersion: config.apiVersion,
        deployment: config.deployment,
      });
  }

  async generateCompletion({ messages, responseSchema }: LlmCompletionRequest): Promise<LlmCompletion> {
    const response = await this.client.chat.completions.create({
      model: this.modelName,
      messages: messages.map((message) => this.toChatMessage(message)),
      ...(responseSchema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: { name: responseSchema.name, schema: responseSchema.definition, strict: true },
            },
          }
        : {}),
      ...(this.supportsTemperatureControl() ? { temperature: 0 } : {}),
    });

    const choice = response.choices[0];
    return {
      content: choice?.message.content ?? "",
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? null,
        outputTokens: response.usage?.completion_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null,
      },
      finishReason: choice ? LLM_FINISH_REASON_BY_AZURE_FINISH_REASON[choice.finish_reason] : null,
    };
  }

  private toChatMessage({ role, content }: LlmMessage): ChatCompletionMessageParam {
    switch (role) {
      case LlmMessageRole.SYSTEM:
        return { role: AzureChatMessageRole.SYSTEM, content };
      case LlmMessageRole.USER:
        return { role: AzureChatMessageRole.USER, content };
      case LlmMessageRole.ASSISTANT:
        return { role: AzureChatMessageRole.ASSISTANT, content };
    }
  }

  private supportsTemperatureControl(): boolean {
    return !REASONING_MODEL_PATTERN.test(this.modelName);
  }
}
