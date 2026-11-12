import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import type { WorkflowTemplateDefinition } from "@/types/workflow-template";

const COPY = WORKFLOW_TEMPLATE_COPY.notes;

const CONFIDENCE_TONES = { high: "success", medium: "warn", low: "danger" } as const;

export function WorkflowTemplateGenerationNotes({ metadata }: { metadata: WorkflowTemplateDefinition["metadata"] }) {
  if (metadata.ambiguities.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold tracking-tight text-ink">{COPY.heading}</h2>
        <Badge tone={CONFIDENCE_TONES[metadata.confidence]}>{COPY.confidence[metadata.confidence]}</Badge>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{COPY.description}</p>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink">
        {metadata.ambiguities.map((ambiguity) => (
          <li key={ambiguity}>{ambiguity}</li>
        ))}
      </ul>
    </Card>
  );
}
