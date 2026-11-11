import { AzureOpenAI } from "openai";
import { EmbeddingError } from "../../errors/embedding.error.js";
import type { IEmbeddingAdapter } from "./embedding-adapter.interface.js";
import type { AzureOpenAIConnectionConfig } from "../../lib/types/config/config.type.js";

export interface AzureOpenAIEmbeddingAdapterOptions {
  config: AzureOpenAIConnectionConfig;
  dimensions: number;
  client?: AzureOpenAI;
}

export class AzureOpenAIEmbeddingAdapter implements IEmbeddingAdapter {
  readonly modelName: string;
  private readonly dimensions: number;
  private readonly client: AzureOpenAI;

  constructor({ config, dimensions, client }: AzureOpenAIEmbeddingAdapterOptions) {
    this.modelName = config.deployment;
    this.dimensions = dimensions;
    this.client =
      client ??
      new AzureOpenAI({
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        apiVersion: config.apiVersion,
        deployment: config.deployment,
      });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.modelName,
      input: text,
      dimensions: this.dimensions,
    });

    const vector = response.data[0]?.embedding;
    if (!vector) {
      throw new EmbeddingError("Embedding response contained no vector");
    }
    return vector;
  }
}
