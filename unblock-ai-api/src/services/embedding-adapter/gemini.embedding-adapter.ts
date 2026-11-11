import { GoogleGenAI } from "@google/genai";
import { EmbeddingPurpose } from "../../data/constants/embedding.constant.js";
import { EmbeddingError } from "../../errors/embedding.error.js";
import type { IEmbeddingAdapter } from "./embedding-adapter.interface.js";
import type { GeminiConnectionConfig } from "../../lib/types/config/config.type.js";

enum GeminiEmbeddingTaskType {
  RETRIEVAL_DOCUMENT = "RETRIEVAL_DOCUMENT",
  RETRIEVAL_QUERY = "RETRIEVAL_QUERY",
}

const GEMINI_TASK_TYPE_BY_PURPOSE: Readonly<Record<EmbeddingPurpose, GeminiEmbeddingTaskType>> = {
  [EmbeddingPurpose.DOCUMENT]: GeminiEmbeddingTaskType.RETRIEVAL_DOCUMENT,
  [EmbeddingPurpose.QUERY]: GeminiEmbeddingTaskType.RETRIEVAL_QUERY,
};

export interface GeminiEmbeddingAdapterOptions {
  config: GeminiConnectionConfig;
  dimensions: number;
  client?: GoogleGenAI;
}

export class GeminiEmbeddingAdapter implements IEmbeddingAdapter {
  readonly modelName: string;
  private readonly dimensions: number;
  private readonly client: GoogleGenAI;

  constructor({ config, dimensions, client }: GeminiEmbeddingAdapterOptions) {
    this.modelName = config.model;
    this.dimensions = dimensions;
    this.client = client ?? new GoogleGenAI({ apiKey: config.apiKey });
  }

  async embed(text: string, purpose: EmbeddingPurpose): Promise<number[]> {
    const response = await this.client.models.embedContent({
      model: this.modelName,
      contents: text,
      config: {
        taskType: GEMINI_TASK_TYPE_BY_PURPOSE[purpose],
        outputDimensionality: this.dimensions,
      },
    });

    const vector = response.embeddings?.[0]?.values;
    if (!vector) {
      throw new EmbeddingError("Embedding response contained no vector");
    }
    return vector;
  }
}
