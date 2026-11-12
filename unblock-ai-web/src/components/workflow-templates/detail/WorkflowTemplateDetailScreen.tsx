"use client";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { WorkflowTemplateEditor } from "@/components/workflow-templates/editor/WorkflowTemplateEditor";
import { WorkflowTemplateVersionView } from "@/components/workflow-templates/versions/WorkflowTemplateVersionView";
import { useWorkflowTemplate } from "@/lib/hooks/useWorkflowTemplateData";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import { describeWorkflowTemplateError } from "@/lib/workflow-template/workflow-template-error-message";

const COPY = WORKFLOW_TEMPLATE_COPY.editor;

interface WorkflowTemplateDetailScreenProps {
  workflowTemplateId: string;
  version: number | null;
}

export function WorkflowTemplateDetailScreen({ workflowTemplateId, version }: WorkflowTemplateDetailScreenProps) {
  const { data, error, mutate } = useWorkflowTemplate(workflowTemplateId);

  if (!data) {
    return error !== undefined ? (
      <InlineAlert onRetry={() => void mutate()}>{describeWorkflowTemplateError(error, COPY.loadFailed)}</InlineAlert>
    ) : (
      <SkeletonRows count={4} label={COPY.loading} />
    );
  }

  const template = data.workflow_template;
  if (version !== null && version !== template.current_version) {
    return <WorkflowTemplateVersionView template={template} version={version} />;
  }
  return <WorkflowTemplateEditor key={template.updated_at} template={template} />;
}
