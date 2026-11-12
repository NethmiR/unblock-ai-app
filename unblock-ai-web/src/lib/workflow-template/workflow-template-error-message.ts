import { apiErrorCode, apiErrorMessage } from "@/lib/api/api-error";
import { WorkflowTemplateErrorCode } from "@/types/workflow-template";

const WORKFLOW_TEMPLATE_ERROR_MESSAGES: Partial<Record<WorkflowTemplateErrorCode, string>> = {
  [WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_FOUND]: "This workflow template no longer exists.",
  [WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_VERSION_NOT_FOUND]: "This version of the workflow template does not exist.",
  [WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_ARCHIVED]: "This workflow template is archived. Restore it before making changes.",
  [WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_ARCHIVED]: "This workflow template is not archived.",
  [WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_NOT_GENERATED]: "Generate the workflow template before publishing it.",
  [WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_ALREADY_PUBLISHED]: "This workflow template is already published.",
  [WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_GENERATION_FAILED]:
    "The workflow could not be generated from this prompt. Make the steps, approvers and conditions more explicit and try again.",
  [WorkflowTemplateErrorCode.WORKFLOW_TEMPLATE_PROMPT_REJECTED]:
    "This prompt does not describe a workflow. Describe who requests what, who approves it and in what order.",
};

function isWorkflowTemplateErrorCode(code: string): code is WorkflowTemplateErrorCode {
  return code in WORKFLOW_TEMPLATE_ERROR_MESSAGES;
}

export function describeWorkflowTemplateError(err: unknown, fallback: string): string {
  const code = apiErrorCode(err);
  return code !== null && isWorkflowTemplateErrorCode(code)
    ? (WORKFLOW_TEMPLATE_ERROR_MESSAGES[code] ?? fallback)
    : apiErrorMessage(err, fallback);
}
