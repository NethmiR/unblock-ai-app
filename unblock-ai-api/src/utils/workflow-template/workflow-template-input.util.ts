import { ValidationError } from "../../errors/validation.error.js";
import { WORKFLOW_TEMPLATE_FIELD_LIMIT } from "../../data/constants/workflow-template.constant.js";

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normaliseWorkflowTemplateTitle(value: string): string {
  const title = collapseWhitespace(value);
  if (!title) throw new ValidationError("Workflow template title cannot be empty", { details: { field: "title" } });
  if (title.length > WORKFLOW_TEMPLATE_FIELD_LIMIT.TITLE_MAX_LENGTH) {
    throw new ValidationError(
      `Workflow template title must be ${WORKFLOW_TEMPLATE_FIELD_LIMIT.TITLE_MAX_LENGTH} characters or fewer`,
      { details: { field: "title" } },
    );
  }
  return title;
}

export function normaliseWorkflowTemplatePrompt(value: string): string {
  const prompt = value.trim();
  if (!prompt) throw new ValidationError("Workflow template prompt cannot be empty", { details: { field: "prompt" } });
  if (prompt.length > WORKFLOW_TEMPLATE_FIELD_LIMIT.PROMPT_MAX_LENGTH) {
    throw new ValidationError(
      `Workflow template prompt must be ${WORKFLOW_TEMPLATE_FIELD_LIMIT.PROMPT_MAX_LENGTH} characters or fewer`,
      { details: { field: "prompt" } },
    );
  }
  return prompt;
}

export function toGeneratedWorkflowTemplateTitle(value: string): string {
  return collapseWhitespace(value).slice(0, WORKFLOW_TEMPLATE_FIELD_LIMIT.TITLE_MAX_LENGTH);
}
