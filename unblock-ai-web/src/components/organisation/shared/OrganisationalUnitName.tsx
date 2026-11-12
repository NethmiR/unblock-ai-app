import { Badge } from "@/components/ui/Badge";
import { CodeChip } from "@/components/ui/CodeChip";
import { ORGANISATION_COPY } from "@/lib/organisation/organisation-copy";
import { cn } from "@/lib/utils/cn";
import type { OrganisationalUnitReferenceDto } from "@/types/organisational-unit";

interface OrganisationalUnitNameProps {
  unit: OrganisationalUnitReferenceDto;
  wrap?: boolean;
  className?: string;
}

export function OrganisationalUnitName({ unit, wrap = false, className }: OrganisationalUnitNameProps) {
  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <span className={cn("font-semibold", wrap ? "break-words" : "truncate", unit.is_archived ? "text-muted" : "text-ink")}>
        {unit.name}
      </span>
      <CodeChip code={unit.code} />
      {unit.is_archived && <Badge tone="warn">{ORGANISATION_COPY.archived}</Badge>}
    </span>
  );
}
