"use client";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { DateTime } from "@/components/ui/DateTime";
import { Drawer } from "@/components/ui/Drawer";
import { QueryState } from "@/components/ui/QueryState";
import { useWorkflowTemplateVersions } from "@/lib/hooks/useWorkflowTemplateData";
import { workflowTemplateDetailPath } from "@/lib/routing/route-path";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import { cn } from "@/lib/utils/cn";
import type { WorkflowTemplateSummaryDto } from "@/types/workflow-template";

const COPY = WORKFLOW_TEMPLATE_COPY.versions;

interface WorkflowTemplateVersionsDrawerProps {
  template: WorkflowTemplateSummaryDto;
  viewingVersion: number | null;
  onClose: () => void;
}

export function WorkflowTemplateVersionsDrawer({ template, viewingVersion, onClose }: WorkflowTemplateVersionsDrawerProps) {
  const { data, error, isLoading, mutate } = useWorkflowTemplateVersions(template.id);
  const selectedVersion = viewingVersion ?? template.current_version;

  return (
    <Drawer title={COPY.title} description={COPY.description} onClose={onClose}>
      <QueryState
        data={data}
        error={error}
        isLoading={isLoading}
        loadingLabel={COPY.loading}
        errorMessage={COPY.loadFailed}
        onRetry={() => void mutate()}
      >
        {({ versions }) => (
          <ol className="flex flex-col gap-2">
            {versions.map((version) => {
              const isCurrent = version.version === template.current_version;
              return (
                <li key={version.version}>
                  <Link
                    href={workflowTemplateDetailPath(template.id, isCurrent ? undefined : version.version)}
                    onClick={onClose}
                    aria-current={version.version === selectedVersion ? "page" : undefined}
                    className={cn(
                      "flex flex-col gap-1 rounded-card border px-4 py-3 transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                      version.version === selectedVersion ? "border-accent/40 bg-accent/5" : "border-line-admin",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-ink">{COPY.versionTitle(version.version)}</span>
                      {isCurrent && <Badge tone="accent">{COPY.current}</Badge>}
                    </span>
                    <span className="text-[12px] text-muted">
                      {version.created_by?.full_name ?? COPY.unknownUser} · <DateTime iso={version.created_at} /> ·{" "}
                      {COPY.attempts(version.generation_attempts)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </QueryState>
    </Drawer>
  );
}
