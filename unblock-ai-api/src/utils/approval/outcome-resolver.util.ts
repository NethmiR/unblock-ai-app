import { ValidationError } from "../../errors/validation.error.js";
import type { StepOutcome, WorkflowStep } from "../../lib/types/workflow/step.type.js";
import type { StepOutcomeResult } from "../../lib/types/task/task.type.js";

export function resolveOutcomeAction(step: WorkflowStep, outcome: StepOutcomeResult): StepOutcome {
  const declared = step.outcomes[outcome];
  if (!declared) {
    throw new ValidationError(`Step '${step.id}' does not declare outcome '${outcome}'`);
  }
  return declared;
}

export function allowedOutcomes(step: WorkflowStep): StepOutcomeResult[] {
  return (Object.keys(step.outcomes) as StepOutcomeResult[]).filter((key) => step.outcomes[key] !== null);
}
