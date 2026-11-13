import type { OrganisationCatalogue } from "../../lib/types/organisation/organisation-catalogue.type.js";
import type { WorkflowDefinition } from "../../lib/types/workflow/workflow.type.js";

export function checkAudienceCodes(workflow: WorkflowDefinition, catalogue: OrganisationCatalogue): string[] {
  const codes = workflow.scope?.applies_to?.organisational_unit_codes ?? [];
  const errors: string[] = [];
  for (const code of codes) {
    const unit = catalogue.unitsByCode.get(code);
    if (!unit) {
      errors.push(`scope.applies_to.organisational_unit_codes references unknown organisational unit '${code}'`);
    } else if (unit.isArchived) {
      errors.push(`scope.applies_to.organisational_unit_codes references archived organisational unit '${code}'`);
    }
  }
  return errors;
}
