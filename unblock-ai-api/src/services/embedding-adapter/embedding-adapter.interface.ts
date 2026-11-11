import type { EmbeddingPurpose } from "../../data/constants/embedding.constant.js";

export interface IEmbeddingAdapter {
  readonly modelName: string;
  embed(text: string, purpose: EmbeddingPurpose): Promise<number[]>;
}
