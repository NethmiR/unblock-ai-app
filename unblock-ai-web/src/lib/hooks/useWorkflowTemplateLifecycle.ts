"use client";
import { WORKFLOW_TEMPLATES_PATH, workflowTemplatesApi } from "@/lib/api/workflow-templates";
import { revalidateApiPaths } from "@/lib/api/swr-cache";
import { LIFECYCLE_COPY, LifecycleAction, type LifecycleCopySet, type LifecycleTarget } from "@/lib/organisation/lifecycle-action";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import { describeWorkflowTemplateError } from "@/lib/workflow-template/workflow-template-error-message";
import { useLifecycleDialog, type LifecycleDialogState } from "./useLifecycleDialog";
import type { WorkflowTemplateSummaryDto } from "@/types/workflow-template";

const WORKFLOW_TEMPLATE_LIFECYCLE_COPY: LifecycleCopySet = {
  ...LIFECYCLE_COPY,
  [LifecycleAction.ARCHIVE]: WORKFLOW_TEMPLATE_COPY.lifecycle.archive,
  [LifecycleAction.RESTORE]: WORKFLOW_TEMPLATE_COPY.lifecycle.restore,
};

async function performLifecycle(action: LifecycleAction, target: LifecycleTarget): Promise<void> {
  if (action === LifecycleAction.ARCHIVE) await workflowTemplatesApi.archive(target.id);
  else await workflowTemplatesApi.restore(target.id);
  await revalidateApiPaths(WORKFLOW_TEMPLATES_PATH);
}

export function toWorkflowTemplateLifecycleTarget(template: WorkflowTemplateSummaryDto): LifecycleTarget {
  return { id: template.id, code: template.id, name: template.title };
}

export function workflowTemplateLifecycleAction(template: WorkflowTemplateSummaryDto): LifecycleAction {
  return template.is_archived ? LifecycleAction.RESTORE : LifecycleAction.ARCHIVE;
}

export function useWorkflowTemplateLifecycle(): LifecycleDialogState {
  return useLifecycleDialog({
    perform: performLifecycle,
    describeError: describeWorkflowTemplateError,
    copy: WORKFLOW_TEMPLATE_LIFECYCLE_COPY,
  });
}
