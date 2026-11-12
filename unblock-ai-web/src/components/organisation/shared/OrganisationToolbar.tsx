"use client";
import { ArchiveListToolbar } from "@/components/ui/ArchiveListToolbar";
import { Button } from "@/components/ui/Button";
import { ORGANISATION_COPY } from "@/lib/organisation/organisation-copy";
import { IconName } from "@/types/icon";
import type { ArchiveFilter } from "@/lib/organisation/archive-filter";

interface OrganisationToolbarProps {
  search: string;
  onSearchChange: (search: string) => void;
  archiveFilter: ArchiveFilter;
  onArchiveFilterChange: (filter: ArchiveFilter) => void;
  createLabel: string;
  onCreate: () => void;
}

export function OrganisationToolbar({
  search,
  onSearchChange,
  archiveFilter,
  onArchiveFilterChange,
  createLabel,
  onCreate,
}: OrganisationToolbarProps) {
  return (
    <ArchiveListToolbar
      search={search}
      onSearchChange={onSearchChange}
      searchPlaceholder={ORGANISATION_COPY.searchPlaceholder}
      archiveFilter={archiveFilter}
      onArchiveFilterChange={onArchiveFilterChange}
      archiveFilterLabel={ORGANISATION_COPY.statusFilterLabel}
      action={
        <Button leadingIcon={IconName.PLUS} onClick={onCreate}>
          {createLabel}
        </Button>
      }
    />
  );
}
