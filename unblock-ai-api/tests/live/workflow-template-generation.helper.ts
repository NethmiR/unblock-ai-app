import { WorkflowTemplateGenerationService } from "../../src/services/workflow-template-generation.service.js";
import { ValidationService } from "../../src/services/validation.service.js";
import type { StoredWorkflowDefinition } from "../../src/lib/types/workflow-template/workflow-template.type.js";

export function createGenerationService(): WorkflowTemplateGenerationService {
  return new WorkflowTemplateGenerationService({ validationService: new ValidationService() });
}

export async function generateDefinition(prompt: string): Promise<StoredWorkflowDefinition> {
  return (await createGenerationService().generate(prompt)).definition;
}
