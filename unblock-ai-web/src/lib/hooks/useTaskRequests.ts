"use client";
import useSWR, { type SWRResponse } from "swr";
import { fetcher } from "@/lib/api/client";
import { taskListPath } from "@/lib/api/tasks";
import { useQueryParams } from "./useQueryParams";
import { useSearchQueryParam } from "./useSearchQueryParam";
import { ListQueryParam, parseOffset } from "@/lib/navigation/list-query-param";
import { TASK_REQUEST_LIST_PAGE_SIZE } from "@/lib/task-request/task-request-constant";
import { TASK_STATUSES, type TaskListResponseDto, type TaskStatus } from "@/types/task";

const RESET_ON_SEARCH: readonly ListQueryParam[] = [ListQueryParam.OFFSET];

function parseStatus(raw: string | null): TaskStatus | null {
  return TASK_STATUSES.find((status) => status === raw) ?? null;
}

export interface TaskRequestList {
  query: SWRResponse<TaskListResponseDto, unknown>;
  search: string;
  debouncedSearch: string;
  setSearch: (search: string) => void;
  status: TaskStatus | null;
  setStatus: (status: TaskStatus | null) => void;
  offset: number;
  setOffset: (offset: number) => void;
  isFiltered: boolean;
}

export function useTaskRequests(): TaskRequestList {
  const params = useQueryParams<ListQueryParam>();
  const { search, debouncedSearch, setSearch } = useSearchQueryParam(RESET_ON_SEARCH);
  const status = parseStatus(params.get(ListQueryParam.STATUS));
  const offset = parseOffset(params.get(ListQueryParam.OFFSET));
  const trimmedSearch = debouncedSearch.trim();

  const query = useSWR<TaskListResponseDto>(
    taskListPath({ status, search: trimmedSearch === "" ? null : trimmedSearch, limit: TASK_REQUEST_LIST_PAGE_SIZE, offset }),
    fetcher,
    { keepPreviousData: true },
  );

  return {
    query,
    search,
    debouncedSearch,
    setSearch,
    status,
    setStatus: (next) => params.set({ [ListQueryParam.STATUS]: next, [ListQueryParam.OFFSET]: null }),
    offset,
    setOffset: (next) => params.set({ [ListQueryParam.OFFSET]: next === 0 ? null : String(next) }),
    isFiltered: status !== null || trimmedSearch !== "",
  };
}
