"use client";
import { useMemo } from "react";
import { useOrganisationalUnits } from "@/lib/hooks/useOrganisationData";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import type { ActorType } from "@/types/workflow";
import type { WorkflowTemplateDefinition } from "@/types/workflow-template";

const COPY = WORKFLOW_TEMPLATE_COPY.audience;

const REQUESTER_TYPE_LABELS: Record<ActorType, string> = COPY.requesterType;

function AudienceChip({ children }: { children: string }) {
  return <span className="rounded-pill border border-line-admin bg-bg px-2 py-px text-[11px] font-semibold text-ink">{children}</span>;
}

export function WorkflowTemplateAudienceSummary({ definition }: { definition: WorkflowTemplateDefinition }) {
  const appliesTo = definition.scope.applies_to;
  const hasUnits = appliesTo.organisational_unit_codes.length > 0;
  const { data } = useOrganisationalUnits({ include_archived: true });

  const unitNames = useMemo(() => {
    const namesByCode = new Map((data?.organisational_units ?? []).map((unit) => [unit.code, unit.name]));
    return appliesTo.organisational_unit_codes.map((code) => namesByCode.get(code) ?? COPY.unknownUnit(code));
  }, [data, appliesTo.organisational_unit_codes]);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span>{COPY.label}:</span>
      {hasUnits ? unitNames.map((name) => <AudienceChip key={name}>{name}</AudienceChip>) : <AudienceChip>{COPY.everyone}</AudienceChip>}
      {appliesTo.actor_type !== "any" && <AudienceChip>{REQUESTER_TYPE_LABELS[appliesTo.actor_type]}</AudienceChip>}
    </span>
  );
}
