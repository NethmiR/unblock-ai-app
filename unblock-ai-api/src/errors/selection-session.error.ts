import { ConflictError } from "./conflict.error.js";
import { NotFoundError } from "./not-found.error.js";
import { SelectionError } from "./selection.error.js";
import { ValidationError } from "./validation.error.js";
import { SelectionErrorCode } from "../data/constants/selection-error.constant.js";

export function selectionSessionNotFound(id: string): NotFoundError {
  return new NotFoundError(`Selection session '${id}' not found`, {
    code: SelectionErrorCode.SELECTION_SESSION_NOT_FOUND,
  });
}

export function selectionSessionLimitReached(): ConflictError {
  return new ConflictError("This conversation has reached its message limit; start over", {
    code: SelectionErrorCode.SELECTION_SESSION_LIMIT_REACHED,
  });
}

export function selectionOptionNotOffered(workflowTemplateId: string): ValidationError {
  return new ValidationError(`Workflow template '${workflowTemplateId}' was not offered in this conversation`, {
    code: SelectionErrorCode.SELECTION_OPTION_NOT_OFFERED,
  });
}

export function selectionSessionNotMatched(): ConflictError {
  return new ConflictError("The conversation has not matched a workflow template yet", {
    code: SelectionErrorCode.SELECTION_SESSION_NOT_MATCHED,
  });
}

export function selectionFailed(cause: unknown): SelectionError {
  return new SelectionError("The assistant could not choose a workflow template", {
    code: SelectionErrorCode.SELECTION_FAILED,
    cause,
  });
}
