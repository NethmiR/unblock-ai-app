import { Badge } from "@/components/ui/Badge";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import { WORKFLOW_TEMPLATE_STATUS_BADGES } from "@/lib/workflow-template/workflow-template-status";
import type { WorkflowTemplateSummaryDto } from "@/types/workflow-template";

const COPY = WORKFLOW_TEMPLATE_COPY.status;

type StatusFields = Pick<WorkflowTemplateSummaryDto, "status" | "is_archived" | "has_ungenerated_changes">;

export function WorkflowTemplateStatusBadges({ template }: { template: StatusFields }) {
  const status = WORKFLOW_TEMPLATE_STATUS_BADGES[template.status];
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge tone={status.tone}>{status.label}</Badge>
      {template.has_ungenerated_changes && <Badge tone="accent">{COPY.ungeneratedChanges}</Badge>}
      {template.is_archived && <Badge tone="warn">{COPY.archived}</Badge>}
    </span>
  );
}
