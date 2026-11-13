"use client";
import useSWR, { type SWRResponse } from "swr";
import { fetcher } from "@/lib/api/client";
import { approverApprovalPendingPath } from "@/lib/api/approvals";
import { useQueryParams } from "./useQueryParams";
import { useSearchQueryParam } from "./useSearchQueryParam";
import { APPROVAL_INBOX_POLL_INTERVAL_MS } from "@/lib/approvals/approval-constant";
import { isApprovalListFiltered, offsetParam, pendingApprovalQuery } from "@/lib/approvals/approval-list-filter";
import { ListQueryParam, parseOffset } from "@/lib/navigation/list-query-param";
import type { ApprovalAssignmentListResponseDto } from "@/types/approval";

const RESET_ON_SEARCH: readonly ListQueryParam[] = [ListQueryParam.OFFSET];

export interface ApprovalInbox {
  query: SWRResponse<ApprovalAssignmentListResponseDto, unknown>;
  search: string;
  setSearch: (search: string) => void;
  offset: number;
  setOffset: (offset: number) => void;
  isFiltered: boolean;
}

export function useApprovalInbox(): ApprovalInbox {
  const params = useQueryParams<ListQueryParam>();
  const { search, debouncedSearch, setSearch } = useSearchQueryParam(RESET_ON_SEARCH);
  const offset = parseOffset(params.get(ListQueryParam.OFFSET));

  const query = useSWR<ApprovalAssignmentListResponseDto>(approverApprovalPendingPath(pendingApprovalQuery({ search: debouncedSearch, offset })), fetcher, {
    keepPreviousData: true,
    refreshInterval: APPROVAL_INBOX_POLL_INTERVAL_MS,
  });

  return {
    query,
    search,
    setSearch,
    offset,
    setOffset: (next) => params.set({ [ListQueryParam.OFFSET]: offsetParam(next) }),
    isFiltered: isApprovalListFiltered({ search: debouncedSearch, offset }),
  };
}
