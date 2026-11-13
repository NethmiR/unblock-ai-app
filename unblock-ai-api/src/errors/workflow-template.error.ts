import { ForbiddenError } from "./forbidden.error.js";
import { ConflictError } from "./conflict.error.js";
import { NotFoundError } from "./not-found.error.js";
import { WorkflowTemplateGenerationError } from "./workflow-template-generation.error.js";
import { WorkflowTemplateErrorCode } from "../data/constants/workflow-template-error.constant.js";

export function workflowTemplateNotFound(id: string): NotFoundError {
  return new NotFoundError(`Workflow template '${id}' not found`, {
    code: WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_FOUND,
  });
}

export function workflowTemplateVersionNotFound(id: string, version: number): NotFoundError {
  return new NotFoundError(`Workflow template '${id}' has no version ${version}`, {
    code: WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_VERSION_NOT_FOUND,
  });
}

export function workflowTemplateArchived(): ConflictError {
  return new ConflictError("The workflow template is archived; restore it before changing it", {
    code: WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_ARCHIVED,
  });
}

export function workflowTemplateNotArchived(): ConflictError {
  return new ConflictError("The workflow template is not archived", {
    code: WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_ARCHIVED,
  });
}

export function workflowTemplateNotGenerated(): ConflictError {
  return new ConflictError("Generate the workflow template before publishing it", {
    code: WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_GENERATED,
  });
}

export function workflowTemplateAlreadyPublished(): ConflictError {
  return new ConflictError("The workflow template is already published", {
    code: WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_ALREADY_PUBLISHED,
  });
}

export function workflowTemplateNotPublished(id: string): ConflictError {
  return new ConflictError(`Workflow template '${id}' is not available to requesters`, {
    code: WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_PUBLISHED,
  });
}

export function workflowTemplatePromptRejected(reasons: readonly string[]): WorkflowTemplateGenerationError {
  return new WorkflowTemplateGenerationError("The prompt does not describe a workflow", {
    code: WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_PROMPT_REJECTED,
    details: [...reasons],
  });
}

export function workflowTemplateNotEligible(id: string): ForbiddenError {
  return new ForbiddenError(`Workflow template '${id}' is not available to you`, {
    code: WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_ELIGIBLE,
  });
}
