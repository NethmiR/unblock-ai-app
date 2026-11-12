"use client";
import { Menu } from "@/components/ui/Menu";
import { Table, TableCell, TableHeader, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { OrganisationalUnitName } from "@/components/organisation/shared/OrganisationalUnitName";
import { rowElementId } from "@/lib/hooks/useHighlightedRow";
import { ORGANISATION_COPY } from "@/lib/organisation/organisation-copy";
import type { DivisionScopeGroup } from "@/lib/organisation/organisational-unit-tree";
import type { OrganisationalUnitManagement } from "@/lib/hooks/useOrganisationalUnitManagement";
import type { OrganisationalUnitSummaryDto } from "@/types/organisational-unit";

const COLUMNS = "minmax(0,1fr) 9rem 2.5rem";

interface DivisionTableProps {
  groups: readonly DivisionScopeGroup<OrganisationalUnitSummaryDto>[];
  rowScope: string;
  management: OrganisationalUnitManagement;
}

export function DivisionTable({ groups, rowScope, management }: DivisionTableProps) {
  return (
    <Table columns={COLUMNS} label={ORGANISATION_COPY.divisions.tableLabel}>
      <TableHeader>
        <TableHeaderCell>{ORGANISATION_COPY.columns.name}</TableHeaderCell>
        <TableHeaderCell>{ORGANISATION_COPY.columns.members}</TableHeaderCell>
        <TableHeaderCell />
      </TableHeader>

      {groups.map((group) => (
        <div key={group.faculty?.id ?? ORGANISATION_COPY.universityLevel} role="rowgroup">
          <div className="border-b border-line-admin bg-bg px-4 py-2 text-[12px] font-semibold text-muted">
            {group.faculty?.name ?? ORGANISATION_COPY.universityLevel}
          </div>
          {group.divisions.map((division) => (
            <TableRow key={division.id} id={rowElementId(rowScope, division.id)} highlighted={management.highlightedId === division.id}>
              <TableCell>
                <OrganisationalUnitName unit={division} />
              </TableCell>
              <TableCell className="text-[13px] text-muted">{ORGANISATION_COPY.memberCount(division.member_count)}</TableCell>
              <TableCell className="flex justify-end">
                <Menu items={management.actionsFor(division)} />
              </TableCell>
            </TableRow>
          ))}
        </div>
      ))}
    </Table>
  );
}
