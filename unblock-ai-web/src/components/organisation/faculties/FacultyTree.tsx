"use client";
import { Icon } from "@/components/ui/icons/Icon";
import { Menu } from "@/components/ui/Menu";
import { Table, TableCell, TableHeader, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { OrganisationalUnitName } from "@/components/organisation/shared/OrganisationalUnitName";
import { rowElementId } from "@/lib/hooks/useHighlightedRow";
import { ORGANISATION_COPY } from "@/lib/organisation/organisation-copy";
import { UnitFormKind } from "@/lib/organisation/unit-form-mode";
import { cn } from "@/lib/utils/cn";
import { IconName } from "@/types/icon";
import { OrganisationalUnitType, type OrganisationalUnitSummaryDto } from "@/types/organisational-unit";
import type { FacultyTreeNode } from "@/lib/organisation/organisational-unit-tree";
import type { OrganisationalUnitManagement } from "@/lib/hooks/useOrganisationalUnitManagement";

const COPY = ORGANISATION_COPY.faculties;
const COLUMNS = "minmax(0,1fr) 9rem 2.5rem";

interface FacultyTreeProps {
  tree: readonly FacultyTreeNode<OrganisationalUnitSummaryDto>[];
  rowScope: string;
  isExpanded: (facultyId: string) => boolean;
  onToggle: (facultyId: string) => void;
  management: OrganisationalUnitManagement;
}

export function FacultyTree({ tree, rowScope, isExpanded, onToggle, management }: FacultyTreeProps) {
  return (
    <Table columns={COLUMNS} label={COPY.tableLabel}>
      <TableHeader>
        <TableHeaderCell>{ORGANISATION_COPY.columns.name}</TableHeaderCell>
        <TableHeaderCell>{ORGANISATION_COPY.columns.members}</TableHeaderCell>
        <TableHeaderCell />
      </TableHeader>

      {tree.map(({ faculty, departments }) => {
        const expanded = isExpanded(faculty.id);
        const addDepartment = {
          label: COPY.addDepartment,
          icon: IconName.PLUS,
          onSelect: () =>
            management.openForm({ kind: UnitFormKind.CREATE, unitType: OrganisationalUnitType.DEPARTMENT, parentId: faculty.id }),
        };
        return (
          <div key={faculty.id} role="rowgroup">
            <TableRow id={rowElementId(rowScope, faculty.id)} highlighted={management.highlightedId === faculty.id}>
              <TableCell>
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={expanded ? COPY.collapse(faculty.name) : COPY.expand(faculty.name)}
                    onClick={() => onToggle(faculty.id)}
                    className="mt-px cursor-pointer rounded-control p-0.5 text-muted hover:bg-bg hover:text-ink"
                  >
                    <Icon name={IconName.CHEVRON_RIGHT} className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
                  </button>
                  <div className="min-w-0">
                    <OrganisationalUnitName unit={faculty} />
                    <p className="mt-0.5 text-[12px] text-muted">{ORGANISATION_COPY.departmentCount(departments.length)}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-[13px] text-muted">{ORGANISATION_COPY.memberCount(faculty.member_count)}</TableCell>
              <TableCell className="flex justify-end">
                <Menu items={management.actionsFor(faculty, faculty.is_archived ? [] : [addDepartment])} />
              </TableCell>
            </TableRow>

            {expanded &&
              (departments.length === 0 ? (
                <div className="border-b border-line-admin bg-bg/40 py-3 pl-12 pr-4 text-[12.5px] text-muted last:border-b-0">
                  {COPY.noDepartments}
                </div>
              ) : (
                departments.map((department) => (
                  <TableRow
                    key={department.id}
                    id={rowElementId(rowScope, department.id)}
                    highlighted={management.highlightedId === department.id}
                    muted
                    className="sm:pl-12"
                  >
                    <TableCell>
                      <OrganisationalUnitName unit={department} />
                    </TableCell>
                    <TableCell className="text-[13px] text-muted">{ORGANISATION_COPY.memberCount(department.member_count)}</TableCell>
                    <TableCell className="flex justify-end">
                      <Menu items={management.actionsFor(department)} />
                    </TableCell>
                  </TableRow>
                ))
              ))}
          </div>
        );
      })}
    </Table>
  );
}
