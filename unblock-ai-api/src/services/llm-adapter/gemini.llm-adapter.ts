import { FinishReason, GoogleGenAI, type Content, type GenerateContentResponseUsageMetadata } from "@google/genai";
import { LlmFinishReason, LlmMessageRole } from "../../data/constants/llm.constant.js";
import type { ILlmAdapter } from "./llm-adapter.interface.js";
import type { LlmCompletion, LlmCompletionRequest, LlmConversationRole, LlmMessage } from "../../lib/types/ai/llm.type.js";
import type { GeminiConnectionConfig } from "../../lib/types/config/config.type.js";

const JSON_MIME_TYPE = "application/json";

enum GeminiContentRole {
  USER = "user",
  MODEL = "model",
}

const GEMINI_ROLE_BY_CONVERSATION_ROLE: Readonly<Record<LlmConversationRole, GeminiContentRole>> = {
  [LlmMessageRole.USER]: GeminiContentRole.USER,
  [LlmMessageRole.ASSISTANT]: GeminiContentRole.MODEL,
};

const LLM_FINISH_REASON_BY_GEMINI_FINISH_REASON: Readonly<Partial<Record<FinishReason, LlmFinishReason>>> = {
  [FinishReason.STOP]: LlmFinishReason.STOP,
  [FinishReason.MAX_TOKENS]: LlmFinishReason.LENGTH,
  [FinishReason.SAFETY]: LlmFinishReason.CONTENT_FILTER,
  [FinishReason.RECITATION]: LlmFinishReason.CONTENT_FILTER,
  [FinishReason.BLOCKLIST]: LlmFinishReason.CONTENT_FILTER,
  [FinishReason.PROHIBITED_CONTENT]: LlmFinishReason.CONTENT_FILTER,
  [FinishReason.SPII]: LlmFinishReason.CONTENT_FILTER,
  [FinishReason.IMAGE_SAFETY]: LlmFinishReason.CONTENT_FILTER,
  [FinishReason.IMAGE_PROHIBITED_CONTENT]: LlmFinishReason.CONTENT_FILTER,
};

export interface GeminiLlmAdapterOptions {
  config: GeminiConnectionConfig;
  client?: GoogleGenAI;
}

export class GeminiLlmAdapter implements ILlmAdapter {
  readonly modelName: string;
  private readonly client: GoogleGenAI;

  constructor({ config, client }: GeminiLlmAdapterOptions) {
    this.modelName = config.model;
    this.client = client ?? new GoogleGenAI({ apiKey: config.apiKey });
  }

  async generateCompletion({ messages, responseSchema }: LlmCompletionRequest): Promise<LlmCompletion> {
    const systemInstruction = messages
      .filter((message) => message.role === LlmMessageRole.SYSTEM)
      .map((message) => message.content)
      .join("\n\n");

    const response = await this.client.models.generateContent({
      model: this.modelName,
      contents: this.toConversationContents(messages),
      config: {
        ...(systemInstruction ? { systemInstruction } : {}),
        ...(responseSchema ? { responseMimeType: JSON_MIME_TYPE, responseJsonSchema: responseSchema.definition } : {}),
      },
    });

    return {
      content: response.text ?? "",
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? null,
        outputTokens: this.countOutputTokens(response.usageMetadata),
        totalTokens: response.usageMetadata?.totalTokenCount ?? null,
      },
      finishReason: this.toLlmFinishReason(response.candidates?.[0]?.finishReason),
    };
  }

  private toConversationContents(messages: LlmMessage[]): Content[] {
    return messages.flatMap((message) =>
      message.role === LlmMessageRole.SYSTEM
        ? []
        : [{ role: GEMINI_ROLE_BY_CONVERSATION_ROLE[message.role], parts: [{ text: message.content }] }],
    );
  }

  private toLlmFinishReason(finishReason: FinishReason | undefined): LlmFinishReason | null {
    if (finishReason === undefined) return null;
    return LLM_FINISH_REASON_BY_GEMINI_FINISH_REASON[finishReason] ?? LlmFinishReason.OTHER;
  }

  private countOutputTokens(usage: GenerateContentResponseUsageMetadata | undefined): number | null {
    if (usage?.candidatesTokenCount === undefined) return null;
    return usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0);
  }
}
