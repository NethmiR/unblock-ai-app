import { createEmbeddingAdapter, type IEmbeddingAdapter } from "./embedding-adapter/index.embedding-adapter.js";
import { config } from "../config/index.config.js";
import { l2normalize } from "../utils/retrieval/vector-math.util.js";
import { EmbeddingPurpose } from "../data/constants/embedding.constant.js";
import { EmbeddingError } from "../errors/embedding.error.js";
import type { EmbeddingMetadata } from "../lib/types/retrieval/retrieval.type.js";

export interface EmbeddingServiceOptions {
  embeddingAdapter?: IEmbeddingAdapter;
  dimensions?: number;
}

export class EmbeddingService {
  private readonly embeddingAdapter: IEmbeddingAdapter;
  private readonly dimensions: number;

  constructor({
    embeddingAdapter = createEmbeddingAdapter(config.embedding),
    dimensions = config.embedding.dimensions,
  }: EmbeddingServiceOptions = {}) {
    this.embeddingAdapter = embeddingAdapter;
    this.dimensions = dimensions;
  }

  private async embed(text: string, purpose: EmbeddingPurpose): Promise<number[]> {
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new EmbeddingError("Cannot embed empty text");
    }

    let vector: number[];
    try {
      vector = await this.embeddingAdapter.embed(text, purpose);
    } catch (err) {
      if (err instanceof EmbeddingError) throw err;
      throw new EmbeddingError(`Embedding request failed: ${(err as Error).message}`, { cause: err });
    }

    if (vector.length !== this.dimensions) {
      throw new EmbeddingError(
        `Expected ${this.dimensions} dimensions, got ${vector.length}. ` +
          `Check EMBEDDING_DIMENSIONS matches the configured embedding model.`,
      );
    }

    return l2normalize(vector);
  }

  embedDocument(text: string): Promise<number[]> {
    return this.embed(text, EmbeddingPurpose.DOCUMENT);
  }

  embedQuery(text: string): Promise<number[]> {
    return this.embed(text, EmbeddingPurpose.QUERY);
  }

  metadata(): EmbeddingMetadata {
    return {
      model: this.embeddingAdapter.modelName,
      dim: this.dimensions,
      embedded_at: new Date().toISOString(),
    };
  }
}
