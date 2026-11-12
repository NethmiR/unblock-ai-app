"use client";
import { SearchInput } from "@/components/ui/SearchInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ARCHIVE_FILTER_OPTIONS, type ArchiveFilter } from "@/lib/organisation/archive-filter";
import type { ReactNode } from "react";

interface ArchiveListToolbarProps {
  search: string;
  onSearchChange: (search: string) => void;
  searchPlaceholder: string;
  archiveFilter: ArchiveFilter;
  onArchiveFilterChange: (filter: ArchiveFilter) => void;
  archiveFilterLabel: string;
  action: ReactNode;
}

export function ArchiveListToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  archiveFilter,
  onArchiveFilterChange,
  archiveFilterLabel,
  action,
}: ArchiveListToolbarProps) {
  return (
    <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="sm:min-w-0 sm:max-w-80 sm:flex-1"
        />
        <SegmentedControl
          label={archiveFilterLabel}
          options={ARCHIVE_FILTER_OPTIONS}
          value={archiveFilter}
          onValueChange={onArchiveFilterChange}
        />
      </div>
      <div className="self-start xl:self-auto">{action}</div>
    </div>
  );
}
