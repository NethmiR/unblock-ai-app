import type {
  StoredWorkflowDefinition,
  StoredWorkflowDefinitionInput,
} from "../../lib/types/workflow-template/workflow-template.type.js";

export function normaliseWorkflowDefinition(stored: StoredWorkflowDefinitionInput): StoredWorkflowDefinition {
  return {
    ...stored,
    scope: {
      ...stored.scope,
      applies_to: {
        ...stored.scope.applies_to,
        organisational_unit_codes: stored.scope.applies_to.organisational_unit_codes ?? [],
      },
    },
    steps: stored.steps.map((step) => ({ ...step, collects_inputs: step.collects_inputs ?? [] })),
  };
}
