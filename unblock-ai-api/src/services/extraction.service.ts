import { createLlmAdapter, type ILlmAdapter } from "./llm-adapter/index.llm-adapter.js";
import { ValidationService } from "./validation.service.js";
import { config } from "../config/index.config.js";
import { RETRIEVAL_SUMMARY_ONLY_PROMPT } from "../data/prompts/retrieval-summary.prompt.js";
import { workflowResponseSchema } from "../data/schemas/workflow-schema.data.js";
import { isRetrievalSummary, retrievalSummaryResponseSchema } from "../data/schemas/retrieval-summary.schema.js";
import { LlmMessageRole } from "../data/constants/llm.constant.js";
import { REVIEW_STATUS } from "../data/constants/status.constant.js";
import { buildExtractionMessages } from "../utils/workflow/build-extraction-messages.util.js";
import { ExtractionError } from "../errors/extraction.error.js";
import type { ExtractionConfig } from "../lib/types/config/config.type.js";
import type { LlmMessage, LlmResponseSchema } from "../lib/types/ai/llm.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";
import type { RetrievalSummary } from "../lib/types/workflow/retrieval-summary.type.js";

export interface ExtractionServiceOptions {
  llmAdapter?: ILlmAdapter;
  validationService: ValidationService;
  extractionConfig?: ExtractionConfig;
}

export interface ExtractionResult {
  workflow: WorkflowDefinition;
  attempts: number;
}

export class ExtractionService {
  private readonly llmAdapter: ILlmAdapter;
  private readonly validationService: ValidationService;
  private readonly extractionConfig: ExtractionConfig;

  constructor({
    llmAdapter = createLlmAdapter(config.llm),
    validationService,
    extractionConfig = config.extraction,
  }: ExtractionServiceOptions) {
    this.llmAdapter = llmAdapter;
    this.validationService = validationService;
    this.extractionConfig = extractionConfig;
  }

  private buildRepairPrompt(errors: string[]): string {
    return (
      `The JSON has these problems:\n${errors.map((e) => `- ${e}`).join("\n")}\n` +
      `Return the corrected JSON. Fix only these problems.`
    );
  }

  private async requestStructuredJson(messages: LlmMessage[], responseSchema: LlmResponseSchema): Promise<unknown> {
    const completion = await this.llmAdapter.generateCompletion({ messages, responseSchema });

    try {
      return JSON.parse(completion.content);
    } catch (err) {
      throw new ExtractionError("Model returned content that is not valid JSON", { cause: err });
    }
  }

  async extract(text: string, options: { maxAttempts?: number } = {}): Promise<ExtractionResult> {
    const maxAttempts = options.maxAttempts ?? this.extractionConfig.maxAttempts;
    const messages = buildExtractionMessages(text);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const candidate = await this.requestStructuredJson(messages, workflowResponseSchema);
      const errors = this.validationService.validate(candidate);

      if (errors.length === 0) {
        const workflow = candidate as WorkflowDefinition;
        if (workflow.metadata.review_status === REVIEW_STATUS.REJECTED) {
          throw new ExtractionError("Source text does not describe a workflow", {
            details: workflow.metadata.ambiguities,
          });
        }
        return { workflow, attempts: attempt };
      }

      if (attempt === maxAttempts) {
        throw new ExtractionError(`Failed to produce a valid workflow after ${maxAttempts} attempts`, {
          details: errors,
        });
      }

      messages.push(
        { role: LlmMessageRole.ASSISTANT, content: JSON.stringify(candidate) },
        { role: LlmMessageRole.USER, content: this.buildRepairPrompt(errors) },
      );
    }

    throw new ExtractionError(`Failed to produce a valid workflow after ${maxAttempts} attempts`, { details: [] });
  }

  async generateRetrievalSummary(workflow: WorkflowDefinition): Promise<RetrievalSummary> {
    const messages: LlmMessage[] = [
      { role: LlmMessageRole.SYSTEM, content: RETRIEVAL_SUMMARY_ONLY_PROMPT },
      { role: LlmMessageRole.USER, content: JSON.stringify(workflow) },
    ];

    const summary = await this.requestStructuredJson(messages, retrievalSummaryResponseSchema);
    if (!isRetrievalSummary(summary)) {
      throw new ExtractionError("Model returned a retrieval summary that does not match its schema");
    }
    return summary;
  }
}
