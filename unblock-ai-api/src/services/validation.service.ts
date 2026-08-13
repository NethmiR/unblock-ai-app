import { validateSchema } from "../utils/workflow/schema-validator.util.js";
import { validateGraph } from "../utils/workflow/graph-validator.util.js";
import { ValidationError } from "../errors/validation.error.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";

export class ValidationService {
  validate(workflow: unknown): string[] {
    return [...validateSchema(workflow), ...validateGraph(workflow as WorkflowDefinition)];
  }

  assertValid(workflow: unknown): asserts workflow is WorkflowDefinition {
    const errors = this.validate(workflow);
    if (errors.length > 0) {
      throw new ValidationError("Workflow failed validation", { details: errors });
    }
  }
}
