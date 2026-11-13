import test from "node:test";
import assert from "node:assert/strict";
import type { AzureOpenAI } from "openai";
import type { GoogleGenAI } from "@google/genai";
import { AzureOpenAIEmbeddingAdapter } from "../../../src/services/embedding-adapter/azure-openai.embedding-adapter.js";
import { GeminiEmbeddingAdapter } from "../../../src/services/embedding-adapter/gemini.embedding-adapter.js";
import {
  VoyageAIEmbeddingAdapter,
  type VoyageAIFetch,
} from "../../../src/services/embedding-adapter/voyage-ai.embedding-adapter.js";
import { createEmbeddingAdapter } from "../../../src/services/embedding-adapter/index.embedding-adapter.js";
import { EmbeddingError } from "../../../src/errors/embedding.error.js";
import { AiProvider } from "../../../src/data/constants/ai-provider.constant.js";
import { EmbeddingPurpose } from "../../../src/data/constants/embedding.constant.js";
import type {
  AzureOpenAIConnectionConfig,
  GeminiConnectionConfig,
  VoyageAIConnectionConfig,
} from "../../../src/lib/types/config/config.type.js";

const AZURE_CONFIG: AzureOpenAIConnectionConfig = {
  endpoint: "https://fake.services.ai.azure.com",
  apiKey: "fake-key",
  apiVersion: "2024-10-21",
  deployment: "text-embedding-3-small",
};

const GEMINI_CONFIG: GeminiConnectionConfig = { apiKey: "fake-key", model: "gemini-embedding-fake" };

const VOYAGE_AI_CONFIG: VoyageAIConnectionConfig = {
  endpoint: "https://fake.voyage.example/v1/",
  apiKey: "fake-key",
  model: "voyage-fake",
};

interface CapturedVoyageAIRequest {
  url: string;
  init: RequestInit;
}

function fakeVoyageAIFetch(
  response: Response,
  capture: (request: CapturedVoyageAIRequest) => void = () => {},
): VoyageAIFetch {
  return async (input, init = {}) => {
    capture({ url: String(input), init });
    return response.clone();
  };
}

function fakeAzureClient(data: unknown[], capture: (body: Record<string, unknown>) => void = () => {}): AzureOpenAI {
  return {
    embeddings: {
      create: async (body: Record<string, unknown>) => {
        capture(body);
        return { data };
      },
    },
  } as unknown as AzureOpenAI;
}

function fakeGeminiClient(embeddings: unknown, capture: (params: Record<string, unknown>) => void = () => {}): GoogleGenAI {
  return {
    models: {
      embedContent: async (params: Record<string, unknown>) => {
        capture(params);
        return { embeddings };
      },
    },
  } as unknown as GoogleGenAI;
}

test("azure adapter requests the configured deployment and dimensions", async () => {
  let sent: Record<string, unknown> = {};
  const adapter = new AzureOpenAIEmbeddingAdapter({
    config: AZURE_CONFIG,
    dimensions: 3,
    client: fakeAzureClient([{ embedding: [0.1, 0.2, 0.3] }], (body) => (sent = body)),
  });

  const vector = await adapter.embed("hello");

  assert.deepEqual(sent, { model: "text-embedding-3-small", input: "hello", dimensions: 3 });
  assert.deepEqual(vector, [0.1, 0.2, 0.3]);
  assert.equal(adapter.modelName, "text-embedding-3-small");
});

test("azure adapter rejects a response without a vector", async () => {
  const adapter = new AzureOpenAIEmbeddingAdapter({ config: AZURE_CONFIG, dimensions: 3, client: fakeAzureClient([]) });

  await assert.rejects(() => adapter.embed("hello"), EmbeddingError);
});

test("gemini adapter maps the embedding purpose to a retrieval task type and requests the dimensions", async () => {
  const sent: Record<string, unknown>[] = [];
  const adapter = new GeminiEmbeddingAdapter({
    config: GEMINI_CONFIG,
    dimensions: 3,
    client: fakeGeminiClient([{ values: [0.1, 0.2, 0.3] }], (params) => sent.push(params)),
  });

  const vector = await adapter.embed("a template", EmbeddingPurpose.DOCUMENT);
  await adapter.embed("a question", EmbeddingPurpose.QUERY);

  assert.deepEqual(vector, [0.1, 0.2, 0.3]);
  assert.deepEqual(sent, [
    {
      model: "gemini-embedding-fake",
      contents: "a template",
      config: { taskType: "RETRIEVAL_DOCUMENT", outputDimensionality: 3 },
    },
    {
      model: "gemini-embedding-fake",
      contents: "a question",
      config: { taskType: "RETRIEVAL_QUERY", outputDimensionality: 3 },
    },
  ]);
});

test("gemini adapter rejects a response without a vector", async () => {
  const adapter = new GeminiEmbeddingAdapter({ config: GEMINI_CONFIG, dimensions: 3, client: fakeGeminiClient(undefined) });

  await assert.rejects(() => adapter.embed("hello", EmbeddingPurpose.QUERY), EmbeddingError);
});

test("voyage ai adapter posts to the embeddings path with the input type for the purpose and the dimensions", async () => {
  const sent: CapturedVoyageAIRequest[] = [];
  const adapter = new VoyageAIEmbeddingAdapter({
    config: VOYAGE_AI_CONFIG,
    dimensions: 3,
    fetchFn: fakeVoyageAIFetch(Response.json({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), (request) => sent.push(request)),
  });

  const vector = await adapter.embed("a template", EmbeddingPurpose.DOCUMENT);
  await adapter.embed("a question", EmbeddingPurpose.QUERY);

  assert.deepEqual(vector, [0.1, 0.2, 0.3]);
  assert.equal(adapter.modelName, "voyage-fake");
  assert.deepEqual(
    sent.map(({ url }) => url),
    ["https://fake.voyage.example/v1/embeddings", "https://fake.voyage.example/v1/embeddings"],
  );
  assert.equal((sent[0]?.init.headers as Record<string, string>).Authorization, "Bearer fake-key");
  assert.deepEqual(
    sent.map(({ init }) => JSON.parse(String(init.body))),
    [
      { model: "voyage-fake", input: ["a template"], input_type: "document", output_dimension: 3 },
      { model: "voyage-fake", input: ["a question"], input_type: "query", output_dimension: 3 },
    ],
  );
});

test("voyage ai adapter rejects a response without a vector", async () => {
  const adapter = new VoyageAIEmbeddingAdapter({
    config: VOYAGE_AI_CONFIG,
    dimensions: 3,
    fetchFn: fakeVoyageAIFetch(Response.json({ data: [] })),
  });

  await assert.rejects(() => adapter.embed("hello", EmbeddingPurpose.QUERY), EmbeddingError);
});

test("voyage ai adapter surfaces the error detail of a failed request", async () => {
  const adapter = new VoyageAIEmbeddingAdapter({
    config: VOYAGE_AI_CONFIG,
    dimensions: 3,
    fetchFn: fakeVoyageAIFetch(Response.json({ detail: "Invalid output_dimension" }, { status: 400 })),
  });

  await assert.rejects(
    () => adapter.embed("hello", EmbeddingPurpose.QUERY),
    (err: unknown) => err instanceof EmbeddingError && /HTTP 400: Invalid output_dimension/.test(err.message),
  );
});

test("createEmbeddingAdapter builds the adapter for the configured provider", () => {
  assert.ok(
    createEmbeddingAdapter({ provider: AiProvider.AZURE_OPENAI, dimensions: 3, azureOpenAI: AZURE_CONFIG }) instanceof
      AzureOpenAIEmbeddingAdapter,
  );
  assert.ok(
    createEmbeddingAdapter({ provider: AiProvider.GEMINI, dimensions: 3, gemini: GEMINI_CONFIG }) instanceof GeminiEmbeddingAdapter,
  );
  assert.ok(
    createEmbeddingAdapter({ provider: AiProvider.VOYAGE_AI, dimensions: 3, voyageAI: VOYAGE_AI_CONFIG }) instanceof
      VoyageAIEmbeddingAdapter,
  );
});
