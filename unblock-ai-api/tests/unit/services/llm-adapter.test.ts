import test from "node:test";
import assert from "node:assert/strict";
import type { AzureOpenAI } from "openai";
import { FinishReason, type GoogleGenAI } from "@google/genai";
import { AzureOpenAILlmAdapter } from "../../../src/services/llm-adapter/azure-openai.llm-adapter.js";
import { GeminiLlmAdapter } from "../../../src/services/llm-adapter/gemini.llm-adapter.js";
import { createLlmAdapter, createLlmAdapters } from "../../../src/services/llm-adapter/index.llm-adapter.js";
import { UsageLoggingLlmAdapter } from "../../../src/services/llm-adapter/usage-logging.llm-adapter.js";
import type { ILlmAdapter } from "../../../src/services/llm-adapter/llm-adapter.interface.js";
import type { Logger } from "../../../src/utils/shared/logger.util.js";
import { AiProvider } from "../../../src/data/constants/ai-provider.constant.js";
import { LlmFinishReason, LlmMessageRole, LlmOperation } from "../../../src/data/constants/llm.constant.js";
import type { LlmCompletionRequest } from "../../../src/lib/types/ai/llm.type.js";
import type {
  AiProviderConnectionConfig,
  AzureOpenAIConnectionConfig,
  GeminiConnectionConfig,
} from "../../../src/lib/types/config/config.type.js";

const AZURE_CONFIG: AzureOpenAIConnectionConfig = {
  endpoint: "https://fake.openai.azure.com/",
  apiKey: "fake-key",
  apiVersion: "2024-10-21",
  deployment: "gpt-4o",
};

const GEMINI_CONFIG: GeminiConnectionConfig = { apiKey: "fake-key", model: "gemini-fake-flash" };

const JSON_CONTENT = JSON.stringify({ ok: true });

const STRUCTURED_REQUEST: LlmCompletionRequest = {
  operation: LlmOperation.WORKFLOW_SELECTION,
  messages: [
    { role: LlmMessageRole.SYSTEM, content: "You are a classifier." },
    { role: LlmMessageRole.USER, content: "first question" },
    { role: LlmMessageRole.ASSISTANT, content: "first answer" },
    { role: LlmMessageRole.USER, content: "follow-up" },
  ],
  responseSchema: { name: "classification", definition: { type: "object" } },
};

function fakeAzureClient(capture: (body: Record<string, unknown>) => void, finishReason = "stop"): AzureOpenAI {
  return {
    chat: {
      completions: {
        create: async (body: Record<string, unknown>) => {
          capture(body);
          return {
            choices: [{ message: { content: JSON_CONTENT }, finish_reason: finishReason }],
            usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
          };
        },
      },
    },
  } as unknown as AzureOpenAI;
}

function fakeGeminiClient(
  capture: (params: Record<string, unknown>) => void,
  candidates: { finishReason: FinishReason }[] = [{ finishReason: FinishReason.STOP }],
): GoogleGenAI {
  return {
    models: {
      generateContent: async (params: Record<string, unknown>) => {
        capture(params);
        return {
          text: JSON_CONTENT,
          candidates,
          usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 5, thoughtsTokenCount: 2, totalTokenCount: 18 },
        };
      },
    },
  } as unknown as GoogleGenAI;
}

test("azure adapter sends a strict json_schema response format and pins temperature for standard models", async () => {
  let sent: Record<string, unknown> = {};
  const adapter = new AzureOpenAILlmAdapter({ config: AZURE_CONFIG, client: fakeAzureClient((body) => (sent = body)) });

  await adapter.generateCompletion(STRUCTURED_REQUEST);

  assert.equal(sent.model, "gpt-4o");
  assert.deepEqual(sent.response_format, {
    type: "json_schema",
    json_schema: { name: "classification", schema: { type: "object" }, strict: true },
  });
  assert.equal(sent.temperature, 0);
  assert.deepEqual(sent.messages, STRUCTURED_REQUEST.messages);
});

test("azure adapter omits temperature for reasoning models", async () => {
  for (const deployment of ["o3-mini", "gpt-5-mini"]) {
    let sent: Record<string, unknown> = {};
    const adapter = new AzureOpenAILlmAdapter({
      config: { ...AZURE_CONFIG, deployment },
      client: fakeAzureClient((body) => (sent = body)),
    });

    await adapter.generateCompletion(STRUCTURED_REQUEST);

    assert.equal("temperature" in sent, false, `${deployment} must not receive temperature`);
  }
});

test("azure adapter omits response_format when no response schema is requested", async () => {
  let sent: Record<string, unknown> = {};
  const adapter = new AzureOpenAILlmAdapter({ config: AZURE_CONFIG, client: fakeAzureClient((body) => (sent = body)) });

  await adapter.generateCompletion({ operation: LlmOperation.WORKFLOW_SELECTION, messages: [{ role: LlmMessageRole.USER, content: "hi" }] });

  assert.equal("response_format" in sent, false);
});

test("azure adapter maps content, usage and finish reason", async () => {
  const adapter = new AzureOpenAILlmAdapter({ config: AZURE_CONFIG, client: fakeAzureClient(() => {}) });

  const completion = await adapter.generateCompletion(STRUCTURED_REQUEST);

  assert.deepEqual(completion, {
    content: JSON_CONTENT,
    usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
    finishReason: LlmFinishReason.STOP,
  });
});

test("azure adapter normalises provider finish reasons", async () => {
  const expectations: [string, LlmFinishReason][] = [
    ["length", LlmFinishReason.LENGTH],
    ["content_filter", LlmFinishReason.CONTENT_FILTER],
    ["tool_calls", LlmFinishReason.OTHER],
  ];

  for (const [azureFinishReason, expected] of expectations) {
    const adapter = new AzureOpenAILlmAdapter({ config: AZURE_CONFIG, client: fakeAzureClient(() => {}, azureFinishReason) });
    const completion = await adapter.generateCompletion(STRUCTURED_REQUEST);
    assert.equal(completion.finishReason, expected, azureFinishReason);
  }
});

test("gemini adapter moves system messages to systemInstruction and maps assistant turns to the model role", async () => {
  let sent: Record<string, unknown> = {};
  const adapter = new GeminiLlmAdapter({ config: GEMINI_CONFIG, client: fakeGeminiClient((params) => (sent = params)) });

  await adapter.generateCompletion(STRUCTURED_REQUEST);

  assert.equal(sent.model, "gemini-fake-flash");
  assert.deepEqual(sent.contents, [
    { role: "user", parts: [{ text: "first question" }] },
    { role: "model", parts: [{ text: "first answer" }] },
    { role: "user", parts: [{ text: "follow-up" }] },
  ]);
  assert.deepEqual(sent.config, {
    systemInstruction: "You are a classifier.",
    responseMimeType: "application/json",
    responseJsonSchema: { type: "object" },
  });
});

test("gemini adapter sends no structured-output config when no response schema is requested", async () => {
  let sent: Record<string, unknown> = {};
  const adapter = new GeminiLlmAdapter({ config: GEMINI_CONFIG, client: fakeGeminiClient((params) => (sent = params)) });

  await adapter.generateCompletion({ operation: LlmOperation.WORKFLOW_SELECTION, messages: [{ role: LlmMessageRole.USER, content: "hi" }] });

  assert.deepEqual(sent.config, {});
});

test("gemini adapter maps content and finish reason, counting thinking tokens as output", async () => {
  const adapter = new GeminiLlmAdapter({ config: GEMINI_CONFIG, client: fakeGeminiClient(() => {}) });

  const completion = await adapter.generateCompletion(STRUCTURED_REQUEST);

  assert.deepEqual(completion, {
    content: JSON_CONTENT,
    usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
    finishReason: LlmFinishReason.STOP,
  });
});

test("gemini adapter normalises provider finish reasons", async () => {
  const expectations: [FinishReason, LlmFinishReason][] = [
    [FinishReason.MAX_TOKENS, LlmFinishReason.LENGTH],
    [FinishReason.SAFETY, LlmFinishReason.CONTENT_FILTER],
    [FinishReason.MALFORMED_FUNCTION_CALL, LlmFinishReason.OTHER],
  ];

  for (const [geminiFinishReason, expected] of expectations) {
    const client = fakeGeminiClient(() => {}, [{ finishReason: geminiFinishReason }]);
    const completion = await new GeminiLlmAdapter({ config: GEMINI_CONFIG, client }).generateCompletion(STRUCTURED_REQUEST);
    assert.equal(completion.finishReason, expected, geminiFinishReason);
  }

  const withoutCandidates = new GeminiLlmAdapter({ config: GEMINI_CONFIG, client: fakeGeminiClient(() => {}, []) });
  assert.equal((await withoutCandidates.generateCompletion(STRUCTURED_REQUEST)).finishReason, null);
});

test("createLlmAdapter builds the adapter for the configured provider", () => {
  assert.ok(createLlmAdapter({ provider: AiProvider.AZURE_OPENAI, azureOpenAI: AZURE_CONFIG }) instanceof AzureOpenAILlmAdapter);
  assert.ok(createLlmAdapter({ provider: AiProvider.GEMINI, gemini: GEMINI_CONFIG }) instanceof GeminiLlmAdapter);
});

function recordingAdapter(modelName: string): ILlmAdapter {
  return {
    modelName,
    generateCompletion: async () => ({
      content: "{}",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      finishReason: LlmFinishReason.STOP,
    }),
  };
}

test("UsageLoggingLlmAdapter delegates and logs usage labelled by operation", async () => {
  const entries: Array<{ message: string; meta: Record<string, unknown> | undefined }> = [];
  const logger: Logger = {
    debug: () => {},
    info: (message, meta) => entries.push({ message, meta }),
    warn: () => {},
    error: () => {},
  };
  const ticks = [100, 140];
  const adapter = new UsageLoggingLlmAdapter({ adapter: recordingAdapter("gpt-small"), logger, now: () => ticks.shift() ?? 0 });

  const completion = await adapter.generateCompletion(STRUCTURED_REQUEST);

  assert.equal(completion.content, "{}");
  assert.equal(adapter.modelName, "gpt-small");
  assert.deepEqual(entries[0]?.meta, {
    operation: LlmOperation.WORKFLOW_SELECTION,
    model: "gpt-small",
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    durationMs: 40,
  });
});

test("createLlmAdapters reuses one adapter when no operation override is configured", () => {
  const built: AiProviderConnectionConfig[] = [];
  const adapters = createLlmAdapters(
    { provider: AiProvider.AZURE_OPENAI, azureOpenAI: AZURE_CONFIG, operationModels: {} },
    (connection) => {
      built.push(connection);
      return recordingAdapter("gpt-4o");
    },
  );

  assert.equal(built.length, 1);
  assert.equal(adapters[LlmOperation.WORKFLOW_SELECTION], adapters[LlmOperation.WORKFLOW_TEMPLATE_GENERATION]);
  assert.ok(adapters[LlmOperation.WORKFLOW_SELECTION] instanceof UsageLoggingLlmAdapter);
});

test("createLlmAdapters routes an operation override to its own model", () => {
  const built: AiProviderConnectionConfig[] = [];
  const adapters = createLlmAdapters(
    { provider: AiProvider.GEMINI, gemini: GEMINI_CONFIG, operationModels: { [LlmOperation.WORKFLOW_SELECTION]: "gemini-mini" } },
    (connection) => {
      built.push(connection);
      return recordingAdapter(connection.provider === AiProvider.GEMINI ? connection.gemini.model : "");
    },
  );

  assert.equal(built.length, 2);
  assert.equal(adapters[LlmOperation.WORKFLOW_SELECTION].modelName, "gemini-mini");
  assert.equal(adapters[LlmOperation.WORKFLOW_TEMPLATE_GENERATION].modelName, GEMINI_CONFIG.model);
});
