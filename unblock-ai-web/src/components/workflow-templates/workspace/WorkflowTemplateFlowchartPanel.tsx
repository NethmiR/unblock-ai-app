"use client";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { FlowchartPlaceholder } from "./FlowchartPlaceholder";
import { WorkflowTemplateAudienceSummary } from "./WorkflowTemplateAudienceSummary";
import { WorkspacePanel } from "./WorkspacePanel";
import { useDesignations } from "@/lib/hooks/useOrganisationData";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import type { WorkflowTemplateDefinition } from "@/types/workflow-template";

const COPY = WORKFLOW_TEMPLATE_COPY.flowchart;

const WorkflowFlowchart = dynamic(
  () => import("@/components/workflow-templates/flowchart/WorkflowFlowchart").then((module) => module.WorkflowFlowchart),
  { ssr: false, loading: () => <FlowchartPlaceholder pulse /> },
);

interface WorkflowTemplateFlowchartPanelProps {
  definition: WorkflowTemplateDefinition | null;
  isGenerating?: boolean;
  isSlowGeneration?: boolean;
  isStale?: boolean;
  hasPrompt?: boolean;
}

function PlaceholderMessage({ children }: { children: string }) {
  return <p className="max-w-[36ch] text-center text-[12.5px] leading-relaxed text-muted">{children}</p>;
}

export function WorkflowTemplateFlowchartPanel({
  definition,
  isGenerating = false,
  isSlowGeneration = false,
  isStale = false,
  hasPrompt = true,
}: WorkflowTemplateFlowchartPanelProps) {
  const { data: designations } = useDesignations(false);
  const designationCodes = useMemo(
    () => (designations ? new Set(designations.designations.map((designation) => designation.code)) : null),
    [designations],
  );
  const meta = definition ? (
    <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      <WorkflowTemplateAudienceSummary definition={definition} />
      <span>{`${COPY.readOnly} · ${COPY.stepCount(definition.steps.length)}`}</span>
    </span>
  ) : (
    COPY.readOnly
  );

  return (
    <WorkspacePanel heading={COPY.heading} meta={meta}>
      {isGenerating ? (
        <FlowchartPlaceholder>
          <Spinner />
          <PlaceholderMessage>{isSlowGeneration ? COPY.slowGenerating : COPY.generating}</PlaceholderMessage>
        </FlowchartPlaceholder>
      ) : definition ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {isStale && (
            <p className="flex-none border-b border-dashed border-warn-border bg-warn-bg px-4 py-2.5 text-center text-[12px] text-warn-ink">
              {COPY.stale}
            </p>
          )}
          <div className="min-h-0 flex-1">
            <WorkflowFlowchart definition={definition} designationCodes={designationCodes} />
          </div>
        </div>
      ) : (
        <FlowchartPlaceholder>
          <PlaceholderMessage>{hasPrompt ? COPY.emptyWithPrompt : COPY.emptyWithoutPrompt}</PlaceholderMessage>
        </FlowchartPlaceholder>
      )}
    </WorkspacePanel>
  );
}
