import type { AzureOpenAI } from "openai";
import { embeddingClient } from "./azure-embedding.client.js";
import { config } from "../config/index.config.js";
import { l2normalize } from "../utils/retrieval/vector-math.util.js";
import { EMBEDDING_MODEL_ID } from "../data/constants/model.constant.js";
import { logger } from "../utils/shared/logger.util.js";
import { EmbeddingError } from "../errors/embedding.error.js";
import type { AzureEmbeddingConfig } from "../lib/types/config/config.type.js";
import type { EmbeddingMetadata } from "../lib/types/retrieval/retrieval.type.js";

export interface EmbeddingServiceOptions {
  client?: AzureOpenAI;
  embeddingConfig?: AzureEmbeddingConfig;
}

export class EmbeddingService {
  private readonly client: AzureOpenAI;
  private readonly embeddingConfig: AzureEmbeddingConfig;

  constructor({ client = embeddingClient, embeddingConfig = config.azureEmbedding }: EmbeddingServiceOptions = {}) {
    this.client = client;
    this.embeddingConfig = embeddingConfig;
  }

  private async embed(text: string): Promise<number[]> {
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new EmbeddingError("Cannot embed empty text");
    }

    let response;
    try {
      response = await this.client.embeddings.create({
        model: this.embeddingConfig.deployment,
        input: text,
      });
    } catch (err) {
      throw new EmbeddingError(`Embedding request failed: ${(err as Error).message}`, { cause: err });
    }

    const vector = response.data?.[0]?.embedding;
    if (!Array.isArray(vector)) {
      throw new EmbeddingError("Embedding response contained no vector");
    }
    if (vector.length !== this.embeddingConfig.dimensions) {
      throw new EmbeddingError(
        `Expected ${this.embeddingConfig.dimensions} dimensions, got ${vector.length}. ` +
          `Check AZURE_EMBEDDING_DIM matches the deployed model.`,
      );
    }

    return l2normalize(vector);
  }

  embedDocument(text: string): Promise<number[]> {
    return this.embed(text);
  }

  embedQuery(text: string): Promise<number[]> {
    return this.embed(text);
  }

  async embedBatch(
    texts: string[],
    options: { onProgress?: (done: number, total: number) => void } = {},
  ): Promise<number[][]> {
    const vectors: number[][] = [];
    for (const [index, text] of texts.entries()) {
      vectors.push(await this.embed(text));
      options.onProgress?.(index + 1, texts.length);
      logger.debug("embedded", { index: index + 1, total: texts.length });
    }
    return vectors;
  }

  metadata(): EmbeddingMetadata {
    return {
      model: EMBEDDING_MODEL_ID,
      dim: this.embeddingConfig.dimensions,
      embedded_at: new Date().toISOString(),
    };
  }
}
