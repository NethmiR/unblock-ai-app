"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Notice } from "@/components/ui/Notice";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { WorkflowTemplateBackLink } from "@/components/workflow-templates/editor/WorkflowTemplateBackLink";
import { WorkflowTemplateVersionMeta } from "@/components/workflow-templates/editor/WorkflowTemplateVersionMeta";
import { WorkflowTemplateFlowchartPanel } from "@/components/workflow-templates/workspace/WorkflowTemplateFlowchartPanel";
import { WorkflowTemplateGenerationNotes } from "@/components/workflow-templates/workspace/WorkflowTemplateGenerationNotes";
import { WorkflowTemplatePromptPanel } from "@/components/workflow-templates/workspace/WorkflowTemplatePromptPanel";
import { WorkflowTemplateWorkspace } from "@/components/workflow-templates/workspace/WorkflowTemplateWorkspace";
import { WorkflowTemplateVersionsDrawer } from "./WorkflowTemplateVersionsDrawer";
import { useWorkflowTemplateVersion } from "@/lib/hooks/useWorkflowTemplateData";
import { workflowTemplateDetailPath } from "@/lib/routing/route-path";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import { describeWorkflowTemplateError } from "@/lib/workflow-template/workflow-template-error-message";
import { IconName } from "@/types/icon";
import type { WorkflowTemplateDto } from "@/types/workflow-template";

const COPY = WORKFLOW_TEMPLATE_COPY.versions;

interface WorkflowTemplateVersionViewProps {
  template: WorkflowTemplateDto;
  version: number;
}

export function WorkflowTemplateVersionView({ template, version }: WorkflowTemplateVersionViewProps) {
  const { data, error, mutate } = useWorkflowTemplateVersion(template.id, version);
  const [isVersionsOpen, setIsVersionsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 flex-1">
          <WorkflowTemplateBackLink />
          <h1 className="mt-3 truncate text-[20px] font-bold tracking-tight text-ink">{template.title}</h1>
          <div className="mt-2 text-[12.5px] text-muted">
            <WorkflowTemplateVersionMeta version={data?.version ?? null} />
          </div>
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2.5">
          <Button variant="secondary" leadingIcon={IconName.HISTORY} onClick={() => setIsVersionsOpen(true)}>
            {WORKFLOW_TEMPLATE_COPY.actions.versionHistory}
          </Button>
          <ButtonLink href={workflowTemplateDetailPath(template.id)}>{COPY.backToCurrent}</ButtonLink>
        </div>
      </header>

      <Notice tone="warn">{COPY.viewing(version, template.current_version ?? version)}</Notice>

      {error !== undefined && !data ? (
        <InlineAlert onRetry={() => void mutate()}>{describeWorkflowTemplateError(error, COPY.loadVersionFailed)}</InlineAlert>
      ) : !data ? (
        <SkeletonRows count={4} label={COPY.loadingVersion} />
      ) : (
        <>
          <WorkflowTemplateWorkspace>
            <WorkflowTemplatePromptPanel value={data.version.prompt} readOnly />
            <WorkflowTemplateFlowchartPanel definition={data.version.definition} />
          </WorkflowTemplateWorkspace>
          <WorkflowTemplateGenerationNotes metadata={data.version.definition.metadata} />
        </>
      )}

      {isVersionsOpen && (
        <WorkflowTemplateVersionsDrawer template={template} viewingVersion={version} onClose={() => setIsVersionsOpen(false)} />
      )}
    </div>
  );
}
