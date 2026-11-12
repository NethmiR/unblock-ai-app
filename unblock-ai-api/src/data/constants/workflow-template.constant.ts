export enum WorkflowTemplateStatus {
  DRAFT = "draft",
  UNPUBLISHED = "unpublished",
  PUBLISHED = "published",
}

export enum WorkflowTemplateVisibility {
  ALL = "all",
  PUBLISHED = "published",
}

export const WORKFLOW_TEMPLATE_STATUSES: readonly WorkflowTemplateStatus[] = Object.values(WorkflowTemplateStatus);

export const WORKFLOW_TEMPLATE_FIELD_LIMIT = {
  TITLE_MAX_LENGTH: 200,
  PROMPT_MAX_LENGTH: 20000,
} as const;
