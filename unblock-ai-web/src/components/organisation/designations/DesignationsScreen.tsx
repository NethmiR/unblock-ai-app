"use client";
import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { LifecycleDialog } from "@/components/organisation/shared/LifecycleDialog";
import { NoMatchingResults } from "@/components/organisation/shared/NoMatchingResults";
import { OrganisationToolbar } from "@/components/organisation/shared/OrganisationToolbar";
import { DesignationFormDrawer } from "./DesignationFormDrawer";
import { DesignationTable } from "./DesignationTable";
import { useArchiveListFilters } from "@/lib/hooks/useArchiveListFilters";
import { DesignationFormState, useDesignationManagement } from "@/lib/hooks/useDesignationManagement";
import { useDesignations } from "@/lib/hooks/useOrganisationData";
import { matchesArchiveFilter } from "@/lib/organisation/archive-filter";
import { DESIGNATION_CATEGORY_LABELS } from "@/lib/organisation/designation-category-label";
import { ORGANISATION_COPY } from "@/lib/organisation/organisation-copy";
import { IconName } from "@/types/icon";
import type { DesignationSummaryDto } from "@/types/designation";

const COPY = ORGANISATION_COPY.designations;
const ROW_SCOPE = "designation";
const DISPLAY_ORDER_STEP = 10;

function matchesSearch(designation: DesignationSummaryDto, search: string): boolean {
  const term = search.trim().toLowerCase();
  return (
    term === "" ||
    [designation.title, designation.code, DESIGNATION_CATEGORY_LABELS[designation.category]].some((text) => text.toLowerCase().includes(term))
  );
}

export function DesignationsScreen() {
  const { data, error, isLoading, mutate } = useDesignations(true);
  const filters = useArchiveListFilters();
  const management = useDesignationManagement(ROW_SCOPE);

  const designations = useMemo(() => data?.designations ?? [], [data]);
  const visible = useMemo(
    () =>
      designations.filter(
        (designation) => matchesArchiveFilter(designation, filters.archiveFilter) && matchesSearch(designation, filters.debouncedSearch),
      ),
    [designations, filters.archiveFilter, filters.debouncedSearch],
  );
  const nextDisplayOrder = designations.reduce((max, designation) => Math.max(max, designation.display_order), 0) + DISPLAY_ORDER_STEP;

  return (
    <>
      <OrganisationToolbar
        search={filters.search}
        onSearchChange={filters.setSearch}
        archiveFilter={filters.archiveFilter}
        onArchiveFilterChange={filters.setArchiveFilter}
        createLabel={COPY.newDesignation}
        onCreate={management.openCreate}
      />

      <QueryState
        data={data}
        error={error}
        isLoading={isLoading}
        loadingLabel={ORGANISATION_COPY.loadingDesignations}
        errorMessage={ORGANISATION_COPY.loadFailed}
        onRetry={() => void mutate()}
      >
        {() => {
          if (designations.length === 0) {
            return (
              <EmptyState
                title={COPY.emptyTitle}
                body={COPY.emptyBody}
                action={
                  <Button leadingIcon={IconName.PLUS} onClick={management.openCreate}>
                    {COPY.newDesignation}
                  </Button>
                }
              />
            );
          }
          if (visible.length === 0) return <NoMatchingResults />;
          return <DesignationTable designations={visible} rowScope={ROW_SCOPE} management={management} />;
        }}
      </QueryState>

      {management.editing !== DesignationFormState.CLOSED && (
        <DesignationFormDrawer
          designation={management.editing === DesignationFormState.CREATING ? null : management.editing}
          nextDisplayOrder={nextDisplayOrder}
          onClose={management.closeForm}
          onSaved={management.handleSaved}
        />
      )}
      <LifecycleDialog state={management.lifecycle} />
    </>
  );
}
