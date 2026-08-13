import { EmbeddingService } from "./embedding.service.js";
import { applyAliasBoost } from "../utils/retrieval/alias-boost.util.js";
import { config } from "../config/index.config.js";
import { logger } from "../utils/shared/logger.util.js";
import type { IVectorStore } from "../lib/types/retrieval/retrieval.type.js";
import type { BoostedCandidate } from "../lib/types/selection/candidate.type.js";
import type { RetrievalConfig } from "../lib/types/config/config.type.js";

export interface RetrievalServiceOptions {
  vectorStore: IVectorStore;
  embeddingService: EmbeddingService;
  retrievalConfig?: RetrievalConfig;
}

export class RetrievalService {
  private readonly vectorStore: IVectorStore;
  private readonly embeddingService: EmbeddingService;
  private readonly retrievalConfig: RetrievalConfig;

  constructor({ vectorStore, embeddingService, retrievalConfig = config.retrieval }: RetrievalServiceOptions) {
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
    this.retrievalConfig = retrievalConfig;
  }

  async retrieve(userQuery: string, options: { institutionType?: string | null } = {}): Promise<BoostedCandidate[]> {
    const queryVector = await this.embeddingService.embedQuery(userQuery);

    const topK = this.retrievalConfig.topK;
    const raw = await this.vectorStore.search(queryVector, {
      k: topK + 2,
      institutionType: options.institutionType,
    });

    const boosted = applyAliasBoost(raw, userQuery, this.retrievalConfig.aliasBoost).slice(0, topK);

    logger.debug("retrieved candidates", {
      query: userQuery.slice(0, 80),
      candidates: boosted.map((c) => ({
        id: c.workflow_id,
        score: Number(c.score.toFixed(4)),
        alias_hits: c.alias_hits,
      })),
    });

    return boosted;
  }
}
