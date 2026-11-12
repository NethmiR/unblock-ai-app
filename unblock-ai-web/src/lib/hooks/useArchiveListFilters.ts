"use client";
import { useCallback } from "react";
import { useQueryParams } from "./useQueryParams";
import { useSearchQueryParam } from "./useSearchQueryParam";
import { ArchiveFilter, parseArchiveFilter } from "@/lib/organisation/archive-filter";
import { ListQueryParam } from "@/lib/navigation/list-query-param";

export interface ArchiveListFilters {
  search: string;
  debouncedSearch: string;
  setSearch: (search: string) => void;
  archiveFilter: ArchiveFilter;
  setArchiveFilter: (filter: ArchiveFilter) => void;
}

export function useArchiveListFilters(): ArchiveListFilters {
  const params = useQueryParams<ListQueryParam>();
  const { search, debouncedSearch, setSearch } = useSearchQueryParam();
  const archiveFilter = parseArchiveFilter(params.get(ListQueryParam.STATUS));

  const setArchiveFilter = useCallback(
    (filter: ArchiveFilter) => params.set({ [ListQueryParam.STATUS]: filter === ArchiveFilter.ACTIVE ? null : filter }),
    [params],
  );

  return { search, debouncedSearch, setSearch, archiveFilter, setArchiveFilter };
}
