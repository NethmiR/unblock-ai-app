import { logger as defaultLogger, type Logger } from "../../utils/shared/logger.util.js";
import type { ILlmAdapter } from "./llm-adapter.interface.js";
import type { LlmCompletion, LlmCompletionRequest } from "../../lib/types/ai/llm.type.js";

const USAGE_LOG_MESSAGE = "llm completion usage";

export interface UsageLoggingLlmAdapterOptions {
  adapter: ILlmAdapter;
  logger?: Logger;
  now?: () => number;
}

export class UsageLoggingLlmAdapter implements ILlmAdapter {
  readonly modelName: string;
  private readonly adapter: ILlmAdapter;
  private readonly logger: Logger;
  private readonly now: () => number;

  constructor({ adapter, logger = defaultLogger, now = Date.now }: UsageLoggingLlmAdapterOptions) {
    this.adapter = adapter;
    this.modelName = adapter.modelName;
    this.logger = logger;
    this.now = now;
  }

  async generateCompletion(request: LlmCompletionRequest): Promise<LlmCompletion> {
    const startedAt = this.now();
    const completion = await this.adapter.generateCompletion(request);
    this.logger.info(USAGE_LOG_MESSAGE, {
      operation: request.operation,
      model: this.modelName,
      inputTokens: completion.usage.inputTokens,
      outputTokens: completion.usage.outputTokens,
      totalTokens: completion.usage.totalTokens,
      durationMs: this.now() - startedAt,
    });
    return completion;
  }
}
