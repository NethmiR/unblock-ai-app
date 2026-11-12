"use client";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { QueryState } from "@/components/ui/QueryState";
import { NoMatchingResults } from "@/components/organisation/shared/NoMatchingResults";
import { OrganisationToolbar } from "@/components/organisation/shared/OrganisationToolbar";
import { OrganisationalUnitDialogs } from "@/components/organisation/shared/OrganisationalUnitDialogs";
import { FacultyTree } from "./FacultyTree";
import { useArchiveListFilters } from "@/lib/hooks/useArchiveListFilters";
import { useOrganisationalUnitManagement, type OrganisationalUnitManagement } from "@/lib/hooks/useOrganisationalUnitManagement";
import type { ArchiveFilter } from "@/lib/organisation/archive-filter";
import { useOrganisationalUnits } from "@/lib/hooks/useOrganisationData";
import { ORGANISATION_COPY } from "@/lib/organisation/organisation-copy";
import { filterFacultyTree } from "@/lib/organisation/organisational-unit-filter";
import { buildFacultyTree } from "@/lib/organisation/organisational-unit-tree";
import { UnitFormKind } from "@/lib/organisation/unit-form-mode";
import { IconName } from "@/types/icon";
import { OrganisationalUnitType, type OrganisationalUnitSummaryDto } from "@/types/organisational-unit";

const COPY = ORGANISATION_COPY.faculties;
const ROW_SCOPE = "faculty";

export function FacultiesScreen() {
  const { data, error, isLoading, mutate } = useOrganisationalUnits({ include_archived: true });
  const filters = useArchiveListFilters();
  const management = useOrganisationalUnitManagement(ROW_SCOPE);
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());

  const units = useMemo(() => data?.organisational_units ?? [], [data]);
  const isSearching = filters.debouncedSearch.trim() !== "";

  const toggle = (facultyId: string) =>
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(facultyId)) next.delete(facultyId);
      else next.add(facultyId);
      return next;
    });

  const createFaculty = () =>
    management.openForm({ kind: UnitFormKind.CREATE, unitType: OrganisationalUnitType.FACULTY, parentId: null });

  return (
    <>
      <OrganisationToolbar
        search={filters.search}
        onSearchChange={filters.setSearch}
        archiveFilter={filters.archiveFilter}
        onArchiveFilterChange={filters.setArchiveFilter}
        createLabel={COPY.newFaculty}
        onCreate={createFaculty}
      />

      <QueryState
        data={data}
        error={error}
        isLoading={isLoading}
        loadingLabel={ORGANISATION_COPY.loadingUnits}
        errorMessage={ORGANISATION_COPY.loadFailed}
        onRetry={() => void mutate()}
      >
        {() => (
          <FacultiesContent
            units={units}
            search={filters.debouncedSearch}
            archiveFilter={filters.archiveFilter}
            onCreateFaculty={createFaculty}
            isExpanded={(facultyId) => isSearching || !collapsedIds.has(facultyId)}
            onToggle={toggle}
            management={management}
          />
        )}
      </QueryState>

      <OrganisationalUnitDialogs management={management} units={units} />
    </>
  );
}

interface FacultiesContentProps {
  units: readonly OrganisationalUnitSummaryDto[];
  search: string;
  archiveFilter: ArchiveFilter;
  onCreateFaculty: () => void;
  isExpanded: (facultyId: string) => boolean;
  onToggle: (facultyId: string) => void;
  management: OrganisationalUnitManagement;
}

function FacultiesContent({ units, search, archiveFilter, onCreateFaculty, isExpanded, onToggle, management }: FacultiesContentProps) {
  const tree = filterFacultyTree(buildFacultyTree(units), search, archiveFilter);

  if (!units.some((unit) => unit.unit_type === OrganisationalUnitType.FACULTY)) {
    return (
      <EmptyState
        title={COPY.emptyTitle}
        body={COPY.emptyBody}
        action={
          <Button leadingIcon={IconName.PLUS} onClick={onCreateFaculty}>
            {COPY.newFaculty}
          </Button>
        }
      />
    );
  }
  if (tree.length === 0) return <NoMatchingResults />;
  return <FacultyTree tree={tree} rowScope={ROW_SCOPE} isExpanded={isExpanded} onToggle={onToggle} management={management} />;
}
