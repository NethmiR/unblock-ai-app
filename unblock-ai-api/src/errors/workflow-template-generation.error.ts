import { BaseError, type BaseErrorOptions } from "./base.error.js";
import { WorkflowTemplateErrorCode } from "../data/constants/workflow-template-error.constant.js";

export class WorkflowTemplateGenerationError extends BaseError {
  readonly statusCode = 422;

  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message, { code: WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_GENERATION_FAILED, ...options });
  }
}
