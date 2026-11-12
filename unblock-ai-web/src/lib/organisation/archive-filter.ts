export enum ArchiveFilter {
  ACTIVE = "active",
  ARCHIVED = "archived",
  ALL = "all",
}

export const ARCHIVE_FILTER_OPTIONS: readonly { value: ArchiveFilter; label: string }[] = [
  { value: ArchiveFilter.ACTIVE, label: "Active" },
  { value: ArchiveFilter.ARCHIVED, label: "Archived" },
  { value: ArchiveFilter.ALL, label: "All" },
];

export function parseArchiveFilter(raw: string | null): ArchiveFilter {
  return ARCHIVE_FILTER_OPTIONS.find((option) => option.value === raw)?.value ?? ArchiveFilter.ACTIVE;
}

export function matchesArchiveFilter(item: { is_archived: boolean }, filter: ArchiveFilter): boolean {
  if (filter === ArchiveFilter.ALL) return true;
  return filter === ArchiveFilter.ARCHIVED ? item.is_archived : !item.is_archived;
}
