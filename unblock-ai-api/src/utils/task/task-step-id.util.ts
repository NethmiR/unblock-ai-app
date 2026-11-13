import {
  APPROVAL_REPEAT_STEP_SUFFIX,
  FORM_ID_SUFFIX,
  INFORMATION_REQUEST_STEP_SUFFIX,
} from "../../data/constants/task.constant.js";

export function informationRequestStepId(definitionStepId: string, n: number): string {
  return `${definitionStepId}${INFORMATION_REQUEST_STEP_SUFFIX}${n}`;
}

export function approvalRepeatStepId(definitionStepId: string, n: number): string {
  return `${definitionStepId}${APPROVAL_REPEAT_STEP_SUFFIX}${n}`;
}

export function formIdForStep(stepId: string): string {
  return `${stepId}${FORM_ID_SUFFIX}`;
}
