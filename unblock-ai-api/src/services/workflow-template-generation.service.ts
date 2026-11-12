import { createLlmAdapter, type ILlmAdapter } from "./llm-adapter/index.llm-adapter.js";
import { ValidationService } from "./validation.service.js";
import { config } from "../config/index.config.js";
import { workflowResponseSchema } from "../data/schemas/workflow-schema.data.js";
import { LlmMessageRole } from "../data/constants/llm.constant.js";
import { buildWorkflowTemplateGenerationMessages } from "../utils/workflow/build-workflow-template-generation-messages.util.js";
import { WorkflowTemplateGenerationError } from "../errors/workflow-template-generation.error.js";
import { workflowTemplatePromptRejected } from "../errors/workflow-template.error.js";
import type { WorkflowTemplateGenerationConfig } from "../lib/types/config/config.type.js";
import type { LlmMessage } from "../lib/types/ai/llm.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";
import type { GeneratedWorkflowTemplate } from "../lib/types/workflow-template/workflow-template.type.js";

export interface WorkflowTemplateGenerationServiceOptions {
  llmAdapter?: ILlmAdapter;
  validationService: ValidationService;
  generationConfig?: WorkflowTemplateGenerationConfig;
}

function buildRepairPrompt(errors: readonly string[]): string {
  return `The JSON has these problems:\n${errors.map((error) => `- ${error}`).join("\n")}\nReturn the corrected JSON. Fix only these problems.`;
}

function toGeneratedTemplate(workflow: WorkflowDefinition, attempts: number): GeneratedWorkflowTemplate {
  const { title, ...definition } = workflow;
  return { title, definition, attempts };
}

export class WorkflowTemplateGenerationService {
  private readonly llmAdapter: ILlmAdapter;
  private readonly validationService: ValidationService;
  private readonly generationConfig: WorkflowTemplateGenerationConfig;

  constructor({
    llmAdapter = createLlmAdapter(config.llm),
    validationService,
    generationConfig = config.workflowTemplateGeneration,
  }: WorkflowTemplateGenerationServiceOptions) {
    this.llmAdapter = llmAdapter;
    this.validationService = validationService;
    this.generationConfig = generationConfig;
  }

  async generate(prompt: string): Promise<GeneratedWorkflowTemplate> {
    const { maxAttempts } = this.generationConfig;
    const messages = buildWorkflowTemplateGenerationMessages(prompt);
    let errors: string[] = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const candidate = await this.requestCandidate(messages);
      errors = this.validationService.validate(candidate);

      if (errors.length === 0) {
        const workflow = candidate as WorkflowDefinition;
        if (!workflow.metadata.is_workflow) throw workflowTemplatePromptRejected(workflow.metadata.ambiguities);
        return toGeneratedTemplate(workflow, attempt);
      }

      messages.push(
        { role: LlmMessageRole.ASSISTANT, content: JSON.stringify(candidate) },
        { role: LlmMessageRole.USER, content: buildRepairPrompt(errors) },
      );
    }

    throw new WorkflowTemplateGenerationError(`Failed to generate a valid workflow template after ${maxAttempts} attempts`, {
      details: errors,
    });
  }

  private async requestCandidate(messages: LlmMessage[]): Promise<unknown> {
    const completion = await this.llmAdapter.generateCompletion({ messages, responseSchema: workflowResponseSchema });
    try {
      return JSON.parse(completion.content);
    } catch (err) {
      throw new WorkflowTemplateGenerationError("The model returned content that is not valid JSON", { cause: err });
    }
  }
}
