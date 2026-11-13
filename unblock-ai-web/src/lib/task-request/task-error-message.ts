import { apiErrorCode } from "@/lib/api/api-error";
import { TASK_REQUEST_COPY } from "./task-request-copy";
import { ApprovalErrorCode } from "@/types/approval";
import { SelectionErrorCode } from "@/types/selection";
import { TaskErrorCode } from "@/types/task";
import { WorkflowTemplateErrorCode } from "@/types/workflow-template";

type TaskRequestErrorCode = TaskErrorCode | SelectionErrorCode | ApprovalErrorCode | WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_ELIGIBLE;

const ERRORS = TASK_REQUEST_COPY.errors;

export const TASK_REQUEST_ERROR_MESSAGES: Record<TaskRequestErrorCode, string> = {
  [TaskErrorCode.TASK_NOT_FOUND]: ERRORS.TASK_NOT_FOUND,
  [TaskErrorCode.TASK_NOT_ACTIVE]: ERRORS.TASK_NOT_ACTIVE,
  [TaskErrorCode.TASK_NOT_DELETABLE]: ERRORS.TASK_NOT_DELETABLE,
  [TaskErrorCode.TASK_REVISION_CONFLICT]: ERRORS.TASK_REVISION_CONFLICT,
  [TaskErrorCode.TASK_FORM_NOT_FOUND]: ERRORS.TASK_FORM_NOT_FOUND,
  [TaskErrorCode.TASK_FORM_ALREADY_SUBMITTED]: ERRORS.TASK_FORM_ALREADY_SUBMITTED,
  [TaskErrorCode.TASK_FORM_NOT_AWAITING_INPUT]: ERRORS.TASK_FORM_NOT_AWAITING_INPUT,
  [TaskErrorCode.TASK_FORM_INVALID]: ERRORS.TASK_FORM_INVALID,
  [TaskErrorCode.TASK_TRANSCRIPT_UNAVAILABLE]: ERRORS.TASK_TRANSCRIPT_UNAVAILABLE,
  [SelectionErrorCode.SELECTION_SESSION_NOT_FOUND]: ERRORS.SELECTION_SESSION_NOT_FOUND,
  [SelectionErrorCode.SELECTION_SESSION_LIMIT_REACHED]: ERRORS.SELECTION_SESSION_LIMIT_REACHED,
  [SelectionErrorCode.SELECTION_OPTION_NOT_OFFERED]: ERRORS.SELECTION_OPTION_NOT_OFFERED,
  [SelectionErrorCode.SELECTION_SESSION_NOT_MATCHED]: ERRORS.SELECTION_SESSION_NOT_MATCHED,
  [SelectionErrorCode.SELECTION_FAILED]: ERRORS.SELECTION_FAILED,
  [WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_ELIGIBLE]: ERRORS.WORKFLOW_TEMPLATE_NOT_ELIGIBLE,
  [ApprovalErrorCode.APPROVAL_LINK_INVALID]: ERRORS.APPROVAL_LINK_INVALID,
  [ApprovalErrorCode.APPROVAL_LINK_EXPIRED]: ERRORS.APPROVAL_LINK_EXPIRED,
  [ApprovalErrorCode.APPROVAL_ALREADY_DECIDED]: ERRORS.APPROVAL_ALREADY_DECIDED,
  [ApprovalErrorCode.APPROVAL_DECISION_NOT_ALLOWED]: ERRORS.APPROVAL_DECISION_NOT_ALLOWED,
  [ApprovalErrorCode.APPROVAL_COMMENT_REQUIRED]: ERRORS.APPROVAL_COMMENT_REQUIRED,
  [ApprovalErrorCode.APPROVAL_NOT_FOUND]: ERRORS.APPROVAL_NOT_FOUND,
};

function isTaskRequestErrorCode(code: string): code is TaskRequestErrorCode {
  return Object.prototype.hasOwnProperty.call(TASK_REQUEST_ERROR_MESSAGES, code);
}

export function taskRequestErrorMessage(err: unknown, fallback: string = ERRORS.generic): string {
  const code = apiErrorCode(err);
  return code !== null && isTaskRequestErrorCode(code) ? TASK_REQUEST_ERROR_MESSAGES[code] : fallback;
}

export function hasErrorCode(err: unknown, code: TaskRequestErrorCode): boolean {
  return apiErrorCode(err) === code;
}
