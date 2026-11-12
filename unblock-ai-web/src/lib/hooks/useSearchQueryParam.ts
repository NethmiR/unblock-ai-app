"use client";
import { useEffect, useState } from "react";
import { useDebouncedValue } from "./useDebouncedValue";
import { useQueryParams } from "./useQueryParams";
import { ListQueryParam } from "@/lib/navigation/list-query-param";

export interface SearchQueryParam {
  search: string;
  debouncedSearch: string;
  setSearch: (search: string) => void;
}

export function useSearchQueryParam(resetParams: readonly ListQueryParam[] = []): SearchQueryParam {
  const params = useQueryParams<ListQueryParam>();
  const urlSearch = params.get(ListQueryParam.SEARCH) ?? "";
  const [search, setSearch] = useState(urlSearch);
  const [lastSeenUrlSearch, setLastSeenUrlSearch] = useState(urlSearch);
  const debouncedSearch = useDebouncedValue(search);

  if (urlSearch !== lastSeenUrlSearch) {
    setLastSeenUrlSearch(urlSearch);
    if (urlSearch !== debouncedSearch) setSearch(urlSearch);
  }

  useEffect(() => {
    if (debouncedSearch !== search || urlSearch === debouncedSearch) return;
    params.set({
      [ListQueryParam.SEARCH]: debouncedSearch,
      ...Object.fromEntries(resetParams.map((param) => [param, null])),
    });
  }, [debouncedSearch, params, resetParams, search, urlSearch]);

  return { search, debouncedSearch, setSearch };
}
