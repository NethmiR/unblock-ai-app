import { WorkflowTemplateStatus } from "@/types/workflow-template";

type BadgeTone = "neutral" | "warn" | "success";

export const WORKFLOW_TEMPLATE_STATUS_BADGES: Record<WorkflowTemplateStatus, { label: string; tone: BadgeTone }> = {
  [WorkflowTemplateStatus.DRAFT]: { label: "Draft", tone: "neutral" },
  [WorkflowTemplateStatus.UNPUBLISHED]: { label: "Unpublished", tone: "warn" },
  [WorkflowTemplateStatus.PUBLISHED]: { label: "Published", tone: "success" },
};
