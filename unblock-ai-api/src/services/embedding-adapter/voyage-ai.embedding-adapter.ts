import { EmbeddingPurpose } from "../../data/constants/embedding.constant.js";
import { AUTHORIZATION_SCHEME } from "../../data/constants/auth.constant.js";
import { HttpHeader, HttpMethod, MediaType } from "../../data/constants/http.constant.js";
import { EmbeddingError } from "../../errors/embedding.error.js";
import type { IEmbeddingAdapter } from "./embedding-adapter.interface.js";
import type { VoyageAIConnectionConfig } from "../../lib/types/config/config.type.js";

const VOYAGE_AI_EMBEDDINGS_PATH = "/embeddings";

enum VoyageAIInputType {
  DOCUMENT = "document",
  QUERY = "query",
}

const VOYAGE_AI_INPUT_TYPE_BY_PURPOSE: Readonly<Record<EmbeddingPurpose, VoyageAIInputType>> = {
  [EmbeddingPurpose.DOCUMENT]: VoyageAIInputType.DOCUMENT,
  [EmbeddingPurpose.QUERY]: VoyageAIInputType.QUERY,
};

interface VoyageAIEmbeddingRequest {
  model: string;
  input: string[];
  input_type: VoyageAIInputType;
  output_dimension: number;
}

interface VoyageAIEmbeddingResponse {
  data?: { embedding?: number[] }[];
}

export type VoyageAIFetch = typeof fetch;

export interface VoyageAIEmbeddingAdapterOptions {
  config: VoyageAIConnectionConfig;
  dimensions: number;
  fetchFn?: VoyageAIFetch;
}

export class VoyageAIEmbeddingAdapter implements IEmbeddingAdapter {
  readonly modelName: string;
  private readonly dimensions: number;
  private readonly url: string;
  private readonly apiKey: string;
  private readonly fetchFn: VoyageAIFetch;

  constructor({ config, dimensions, fetchFn }: VoyageAIEmbeddingAdapterOptions) {
    this.modelName = config.model;
    this.dimensions = dimensions;
    this.url = `${config.endpoint.replace(/\/+$/, "")}${VOYAGE_AI_EMBEDDINGS_PATH}`;
    this.apiKey = config.apiKey;
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async embed(text: string, purpose: EmbeddingPurpose): Promise<number[]> {
    const request: VoyageAIEmbeddingRequest = {
      model: this.modelName,
      input: [text],
      input_type: VOYAGE_AI_INPUT_TYPE_BY_PURPOSE[purpose],
      output_dimension: this.dimensions,
    };

    const response = await this.fetchFn(this.url, {
      method: HttpMethod.POST,
      headers: {
        [HttpHeader.AUTHORIZATION]: `${AUTHORIZATION_SCHEME} ${this.apiKey}`,
        [HttpHeader.CONTENT_TYPE]: MediaType.JSON,
        [HttpHeader.ACCEPT]: MediaType.JSON,
      },
      body: JSON.stringify(request),
    });

    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const detail = extractVoyageAIError(body) ?? response.statusText;
      throw new EmbeddingError(`Voyage AI returned HTTP ${response.status}: ${detail}`, {
        details: { status: response.status },
      });
    }

    const vector = (body as VoyageAIEmbeddingResponse | null)?.data?.[0]?.embedding;
    if (!vector) {
      throw new EmbeddingError("Embedding response contained no vector");
    }
    return vector;
  }
}

function extractVoyageAIError(body: unknown): string | null {
  if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") {
    return body.detail;
  }
  return null;
}
