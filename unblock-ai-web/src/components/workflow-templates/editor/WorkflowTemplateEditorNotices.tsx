import { InlineAlert } from "@/components/ui/InlineAlert";
import { Notice } from "@/components/ui/Notice";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import { WorkflowTemplateStatus, type WorkflowTemplateDto } from "@/types/workflow-template";

const COPY = WORKFLOW_TEMPLATE_COPY.editor;

interface WorkflowTemplateEditorNoticesProps {
  template: WorkflowTemplateDto | null;
  actionError: string | null;
}

function StatusNotice({ template }: { template: WorkflowTemplateDto }) {
  if (template.is_archived) return <Notice tone="warn">{COPY.archivedNotice}</Notice>;
  if (template.status === WorkflowTemplateStatus.PUBLISHED && template.current_version !== null) {
    return <Notice>{COPY.liveHint(template.current_version)}</Notice>;
  }
  if (template.status === WorkflowTemplateStatus.UNPUBLISHED) return <Notice>{COPY.publishHint}</Notice>;
  return null;
}

export function WorkflowTemplateEditorNotices({ template, actionError }: WorkflowTemplateEditorNoticesProps) {
  return (
    <>
      {actionError && <InlineAlert>{actionError}</InlineAlert>}
      {template && <StatusNotice template={template} />}
    </>
  );
}
