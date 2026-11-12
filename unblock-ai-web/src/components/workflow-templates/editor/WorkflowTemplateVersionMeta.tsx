import { DateTime } from "@/components/ui/DateTime";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import type { WorkflowTemplateVersionSummaryDto } from "@/types/workflow-template";

const COPY = WORKFLOW_TEMPLATE_COPY.editor;

export function WorkflowTemplateVersionMeta({ version }: { version: WorkflowTemplateVersionSummaryDto | null }) {
  if (version === null) return <span>{COPY.notGenerated}</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      <span className="font-semibold text-ink">{COPY.versionMeta(version.version)}</span>
      {version.created_by && <span>· {COPY.generatedBy(version.created_by.full_name)}</span>}
      <span>
        · <DateTime iso={version.created_at} />
      </span>
      {version.generation_attempts > 1 && <span>· {COPY.attempts(version.generation_attempts)}</span>}
    </span>
  );
}
