import { ConflictError } from "./conflict.error.js";
import { NotFoundError } from "./not-found.error.js";
import { ValidationError } from "./validation.error.js";
import { TaskErrorCode } from "../data/constants/task-error.constant.js";
import type { FormFieldIssue } from "../lib/types/task/task-form.type.js";

export function taskNotFound(id: string): NotFoundError {
  return new NotFoundError(`Task '${id}' not found`, { code: TaskErrorCode.TASK_NOT_FOUND });
}

export function taskNotActive(): ConflictError {
  return new ConflictError("The task has already finished", { code: TaskErrorCode.TASK_NOT_ACTIVE });
}

export function taskNotDeletable(): ConflictError {
  return new ConflictError("The task cannot be deleted while an approval is in progress", {
    code: TaskErrorCode.TASK_NOT_DELETABLE,
  });
}

export function taskRevisionConflict(): ConflictError {
  return new ConflictError("The task was changed by someone else; reload it and try again", {
    code: TaskErrorCode.TASK_REVISION_CONFLICT,
  });
}

export function taskFormNotFound(formId: string): NotFoundError {
  return new NotFoundError(`Form '${formId}' not found on this task`, { code: TaskErrorCode.TASK_FORM_NOT_FOUND });
}

export function taskFormAlreadySubmitted(): ConflictError {
  return new ConflictError("The form has already been submitted", { code: TaskErrorCode.TASK_FORM_ALREADY_SUBMITTED });
}

export function taskFormNotAwaitingInput(): ConflictError {
  return new ConflictError("The form's step is not waiting for your input yet", {
    code: TaskErrorCode.TASK_FORM_NOT_AWAITING_INPUT,
  });
}

export function taskFormInvalid(issues: FormFieldIssue[]): ValidationError {
  return new ValidationError("Some fields need attention", {
    code: TaskErrorCode.TASK_FORM_INVALID,
    details: { issues },
  });
}

export function taskTranscriptUnavailable(): ConflictError {
  return new ConflictError("A transcript is only available for a completed task", {
    code: TaskErrorCode.TASK_TRANSCRIPT_UNAVAILABLE,
  });
}
