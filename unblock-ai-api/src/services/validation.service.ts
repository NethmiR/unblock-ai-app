import { validateSchema } from "../utils/workflow/schema-validator.util.js";
import { validateGraph } from "../utils/workflow/graph-validator.util.js";
import { checkAudienceCodes } from "../utils/workflow/catalogue-validator.util.js";
import { ValidationError } from "../errors/validation.error.js";
import type { OrganisationCatalogue } from "../lib/types/organisation/organisation-catalogue.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";

export class ValidationService {
  validate(workflow: unknown, catalogue: OrganisationCatalogue): string[] {
    const schemaErrors = validateSchema(workflow);
    const definition = workflow as WorkflowDefinition;
    return [...schemaErrors, ...validateGraph(definition), ...checkAudienceCodes(definition, catalogue)];
  }

  assertValid(workflow: unknown, catalogue: OrganisationCatalogue): asserts workflow is WorkflowDefinition {
    const errors = this.validate(workflow, catalogue);
    if (errors.length > 0) {
      throw new ValidationError("Workflow failed validation", { details: errors });
    }
  }
}
