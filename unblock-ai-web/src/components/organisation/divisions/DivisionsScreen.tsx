"use client";
import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { NoMatchingResults } from "@/components/organisation/shared/NoMatchingResults";
import { OrganisationToolbar } from "@/components/organisation/shared/OrganisationToolbar";
import { OrganisationalUnitDialogs } from "@/components/organisation/shared/OrganisationalUnitDialogs";
import { DivisionTable } from "./DivisionTable";
import { useArchiveListFilters } from "@/lib/hooks/useArchiveListFilters";
import { useOrganisationalUnitManagement } from "@/lib/hooks/useOrganisationalUnitManagement";
import { useOrganisationalUnits } from "@/lib/hooks/useOrganisationData";
import { ORGANISATION_COPY } from "@/lib/organisation/organisation-copy";
import { matchesUnitFilters } from "@/lib/organisation/organisational-unit-filter";
import { groupDivisionsByScope } from "@/lib/organisation/organisational-unit-tree";
import { UnitFormKind } from "@/lib/organisation/unit-form-mode";
import { IconName } from "@/types/icon";
import { OrganisationalUnitType } from "@/types/organisational-unit";

const COPY = ORGANISATION_COPY.divisions;
const ROW_SCOPE = "division";

export function DivisionsScreen() {
  const { data, error, isLoading, mutate } = useOrganisationalUnits({ include_archived: true });
  const filters = useArchiveListFilters();
  const management = useOrganisationalUnitManagement(ROW_SCOPE);

  const units = useMemo(() => data?.organisational_units ?? [], [data]);
  const divisions = useMemo(() => units.filter((unit) => unit.unit_type === OrganisationalUnitType.DIVISION), [units]);
  const groups = useMemo(
    () => groupDivisionsByScope(divisions.filter((unit) => matchesUnitFilters(unit, filters.debouncedSearch, filters.archiveFilter))),
    [divisions, filters.debouncedSearch, filters.archiveFilter],
  );

  const createDivision = () =>
    management.openForm({ kind: UnitFormKind.CREATE, unitType: OrganisationalUnitType.DIVISION, parentId: null });

  return (
    <>
      <OrganisationToolbar
        search={filters.search}
        onSearchChange={filters.setSearch}
        archiveFilter={filters.archiveFilter}
        onArchiveFilterChange={filters.setArchiveFilter}
        createLabel={COPY.newDivision}
        onCreate={createDivision}
      />

      <QueryState
        data={data}
        error={error}
        isLoading={isLoading}
        loadingLabel={ORGANISATION_COPY.loadingUnits}
        errorMessage={ORGANISATION_COPY.loadFailed}
        onRetry={() => void mutate()}
      >
        {() => {
          if (divisions.length === 0) {
            return (
              <EmptyState
                title={COPY.emptyTitle}
                body={COPY.emptyBody}
                action={
                  <Button leadingIcon={IconName.PLUS} onClick={createDivision}>
                    {COPY.newDivision}
                  </Button>
                }
              />
            );
          }
          if (groups.length === 0) return <NoMatchingResults />;
          return <DivisionTable groups={groups} rowScope={ROW_SCOPE} management={management} />;
        }}
      </QueryState>

      <OrganisationalUnitDialogs management={management} units={units} />
    </>
  );
}
