"use client";
import useSWR, { type SWRResponse } from "swr";
import { fetcher } from "@/lib/api/client";
import { approverApprovalHistoryPath } from "@/lib/api/approvals";
import { useQueryParams } from "./useQueryParams";
import { useSearchQueryParam } from "./useSearchQueryParam";
import { approvalHistoryQuery, isApprovalListFiltered, offsetParam, parseDecisionParam } from "@/lib/approvals/approval-list-filter";
import { ListQueryParam, parseOffset } from "@/lib/navigation/list-query-param";
import type { ApprovalAssignmentListResponseDto } from "@/types/approval";
import type { ApprovalDecision } from "@/types/task";

const RESET_ON_SEARCH: readonly ListQueryParam[] = [ListQueryParam.OFFSET];

export interface ApprovalHistory {
  query: SWRResponse<ApprovalAssignmentListResponseDto, unknown>;
  search: string;
  setSearch: (search: string) => void;
  decision: ApprovalDecision | null;
  setDecision: (decision: ApprovalDecision | null) => void;
  offset: number;
  setOffset: (offset: number) => void;
  isFiltered: boolean;
}

export function useApprovalHistory(): ApprovalHistory {
  const params = useQueryParams<ListQueryParam>();
  const { search, debouncedSearch, setSearch } = useSearchQueryParam(RESET_ON_SEARCH);
  const decision = parseDecisionParam(params.get(ListQueryParam.DECISION));
  const offset = parseOffset(params.get(ListQueryParam.OFFSET));

  const query = useSWR<ApprovalAssignmentListResponseDto>(
    approverApprovalHistoryPath(approvalHistoryQuery({ search: debouncedSearch, offset, decision })),
    fetcher,
    { keepPreviousData: true },
  );

  return {
    query,
    search,
    setSearch,
    decision,
    setDecision: (next) => params.set({ [ListQueryParam.DECISION]: next, [ListQueryParam.OFFSET]: null }),
    offset,
    setOffset: (next) => params.set({ [ListQueryParam.OFFSET]: offsetParam(next) }),
    isFiltered: isApprovalListFiltered({ search: debouncedSearch, offset, decision }),
  };
}
