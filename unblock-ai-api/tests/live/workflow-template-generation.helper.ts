import { WorkflowTemplateGenerationService } from "../../src/services/workflow-template-generation.service.js";
import { ValidationService } from "../../src/services/validation.service.js";
import { createLlmAdapters } from "../../src/services/llm-adapter/index.llm-adapter.js";
import { LlmOperation } from "../../src/data/constants/llm.constant.js";
import { config } from "../../src/config/index.config.js";
import { seedOrganisationCatalogueService } from "../helpers/organisation-catalogue.helper.js";
import type { StoredWorkflowDefinition } from "../../src/lib/types/workflow-template/workflow-template.type.js";

export function createGenerationService(): WorkflowTemplateGenerationService {
  return new WorkflowTemplateGenerationService({
    llmAdapter: createLlmAdapters(config.llm)[LlmOperation.WORKFLOW_TEMPLATE_GENERATION],
    validationService: new ValidationService(),
    organisationCatalogueService: seedOrganisationCatalogueService(),
    generationConfig: config.workflowTemplateGeneration,
  });
}

export async function generateDefinition(prompt: string): Promise<StoredWorkflowDefinition> {
  return (await createGenerationService().generate(prompt)).definition;
}
