import type { AzureOpenAI } from "openai";
import { chatClient } from "./azure-openai.client.js";
import { ValidationService } from "./validation.service.js";
import { config } from "../config/index.config.js";
import { SYSTEM_PROMPT } from "../data/prompts/extraction.prompt.js";
import { FEW_SHOT_MESSAGES, type FewShotMessage } from "../data/prompts/extraction-few-shot.prompt.js";
import { RETRIEVAL_SUMMARY_ONLY_PROMPT } from "../data/prompts/retrieval-summary.prompt.js";
import { strictWorkflowSchema } from "../data/schemas/workflow-schema.data.js";
import { retrievalSummarySchema } from "../data/schemas/retrieval-summary.schema.js";
import { supportsTemperatureControl } from "../data/constants/model.constant.js";
import { ExtractionError } from "../errors/extraction.error.js";
import type { AzureOpenAIConfig } from "../lib/types/config/config.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";
import type { RetrievalSummary } from "../lib/types/workflow/retrieval-summary.type.js";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface ExtractionServiceOptions {
  client?: AzureOpenAI;
  validationService: ValidationService;
  openAIConfig?: AzureOpenAIConfig;
}

export interface ExtractionResult {
  workflow: WorkflowDefinition;
  attempts: number;
}

export class ExtractionService {
  private readonly client: AzureOpenAI;
  private readonly validationService: ValidationService;
  private readonly openAIConfig: AzureOpenAIConfig;

  constructor({ client = chatClient, validationService, openAIConfig = config.azureOpenAI }: ExtractionServiceOptions) {
    this.client = client;
    this.validationService = validationService;
    this.openAIConfig = openAIConfig;
  }

  private buildMessages(text: string): ChatMessage[] {
    return [
      { role: "system", content: SYSTEM_PROMPT },
      ...(FEW_SHOT_MESSAGES as FewShotMessage[]),
      { role: "user", content: text },
    ];
  }

  private buildRepairPrompt(errors: string[]): string {
    return (
      `The JSON has these problems:\n${errors.map((e) => `- ${e}`).join("\n")}\n` +
      `Return the corrected JSON. Fix only these problems.`
    );
  }

  private async callModel(messages: ChatMessage[]): Promise<unknown> {
    const response = await this.client.chat.completions.create({
      model: this.openAIConfig.deployment,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "workflow_definition",
          schema: strictWorkflowSchema,
          strict: true,
        },
      },
      ...(supportsTemperatureControl(this.openAIConfig.deployment) ? { temperature: 0 } : {}),
    });

    const content = response.choices[0]?.message.content ?? "";

    try {
      return JSON.parse(content);
    } catch (err) {
      throw new ExtractionError("Azure returned content that is not valid JSON", { cause: err });
    }
  }

  async extract(text: string, options: { maxAttempts?: number } = {}): Promise<ExtractionResult> {
    const maxAttempts = options.maxAttempts ?? this.openAIConfig.maxExtractionAttempts;
    const messages = this.buildMessages(text);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const candidate = (await this.callModel(messages)) as WorkflowDefinition;
      const errors = this.validationService.validate(candidate);

      if (errors.length === 0) {
        if (candidate.metadata?.review_status === "rejected") {
          throw new ExtractionError("Source text does not describe a workflow", {
            details: candidate.metadata.ambiguities,
          });
        }
        return { workflow: candidate, attempts: attempt };
      }

      if (attempt === maxAttempts) {
        throw new ExtractionError(`Failed to produce a valid workflow after ${maxAttempts} attempts`, {
          details: errors,
        });
      }

      messages.push(
        { role: "assistant", content: JSON.stringify(candidate) },
        { role: "user", content: this.buildRepairPrompt(errors) },
      );
    }

    throw new ExtractionError(`Failed to produce a valid workflow after ${maxAttempts} attempts`, { details: [] });
  }

  async generateRetrievalSummary(workflow: WorkflowDefinition): Promise<RetrievalSummary> {
    const response = await this.client.chat.completions.create({
      model: this.openAIConfig.deployment,
      temperature: 0,
      messages: [
        { role: "system", content: RETRIEVAL_SUMMARY_ONLY_PROMPT },
        { role: "user", content: JSON.stringify(workflow) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "retrieval_summary", schema: retrievalSummarySchema, strict: true },
      },
    });

    return JSON.parse(response.choices[0]?.message.content ?? "{}") as RetrievalSummary;
  }
}
