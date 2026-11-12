"use client";
import { Badge } from "@/components/ui/Badge";
import { CodeChip } from "@/components/ui/CodeChip";
import { Menu } from "@/components/ui/Menu";
import { Table, TableCell, TableHeader, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { rowElementId } from "@/lib/hooks/useHighlightedRow";
import { DESIGNATION_CATEGORY_LABELS } from "@/lib/organisation/designation-category-label";
import { ORGANISATION_COPY } from "@/lib/organisation/organisation-copy";
import { ORGANISATIONAL_UNIT_TYPE_LABELS } from "@/lib/organisation/organisational-unit-label";
import { cn } from "@/lib/utils/cn";
import type { DesignationManagement } from "@/lib/hooks/useDesignationManagement";
import type { DesignationSummaryDto } from "@/types/designation";

const COPY = ORGANISATION_COPY.designations;
const COLUMNS = "minmax(0,1.6fr) minmax(0,0.9fr) minmax(0,1.3fr) 7rem 2.5rem";

interface DesignationTableProps {
  designations: readonly DesignationSummaryDto[];
  rowScope: string;
  management: DesignationManagement;
}

export function DesignationTable({ designations, rowScope, management }: DesignationTableProps) {
  return (
    <Table columns={COLUMNS} label={COPY.tableLabel}>
      <TableHeader>
        <TableHeaderCell>{COPY.columns.designation}</TableHeaderCell>
        <TableHeaderCell>{COPY.columns.category}</TableHeaderCell>
        <TableHeaderCell>{COPY.columns.heldIn}</TableHeaderCell>
        <TableHeaderCell>{COPY.columns.holders}</TableHeaderCell>
        <TableHeaderCell />
      </TableHeader>

      {designations.map((designation) => (
        <TableRow key={designation.id} id={rowElementId(rowScope, designation.id)} highlighted={management.highlightedId === designation.id}>
          <TableCell>
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className={cn("truncate font-semibold", designation.is_archived ? "text-muted" : "text-ink")}>{designation.title}</span>
              <CodeChip code={designation.code} />
              {designation.single_holder_per_unit && <Badge tone="accent">{COPY.singleHolder}</Badge>}
              {designation.is_archived && <Badge tone="warn">{ORGANISATION_COPY.archived}</Badge>}
            </span>
          </TableCell>
          <TableCell className="text-[13px] text-muted">{DESIGNATION_CATEGORY_LABELS[designation.category]}</TableCell>
          <TableCell>
            <span className="flex flex-wrap gap-1.5">
              {designation.applicable_unit_types.map((unitType) => (
                <Badge key={unitType}>{ORGANISATIONAL_UNIT_TYPE_LABELS[unitType].plural}</Badge>
              ))}
            </span>
          </TableCell>
          <TableCell className="text-[13px] text-muted">{ORGANISATION_COPY.holderCount(designation.holder_count)}</TableCell>
          <TableCell className="flex justify-end">
            <Menu items={management.actionsFor(designation)} />
          </TableCell>
        </TableRow>
      ))}
    </Table>
  );
}
