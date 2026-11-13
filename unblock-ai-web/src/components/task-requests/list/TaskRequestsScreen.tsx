"use client";
import { useRouter } from "next/navigation";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { QueryState } from "@/components/ui/QueryState";
import { SearchInput } from "@/components/ui/SearchInput";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/SegmentedControl";
import { NoMatchingResults } from "@/components/organisation/shared/NoMatchingResults";
import { TaskRequestActionDialog } from "@/components/task-requests/shared/TaskRequestActionDialog";
import { TaskRequestTable } from "./TaskRequestTable";
import { useTaskRequestActions } from "@/lib/hooks/useTaskRequestActions";
import { useTaskRequests } from "@/lib/hooks/useTaskRequests";
import { RoutePath, taskDetailPath } from "@/lib/routing/route-path";
import { lifecycleMenuItems, summaryAvailableActions } from "@/lib/task-request/task-request-menu-items";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { TASK_STATUS_PRESENTATION } from "@/lib/task-request/task-status-presentation";
import { IconName } from "@/types/icon";
import { TASK_STATUSES, type TaskStatus, type TaskSummaryDto } from "@/types/task";
import type { MenuItem } from "@/types/menu";

const COPY = TASK_REQUEST_COPY.list;
const ALL_STATUSES = "all";

type StatusFilter = TaskStatus | typeof ALL_STATUSES;

const STATUS_OPTIONS: readonly SegmentedOption<StatusFilter>[] = [
  { value: ALL_STATUSES, label: COPY.all },
  ...TASK_STATUSES.map((status) => ({ value: status, label: TASK_STATUS_PRESENTATION[status].label })),
];

export function TaskRequestsScreen() {
  const router = useRouter();
  const list = useTaskRequests();
  const actions = useTaskRequestActions();
  const { data, error, isLoading, mutate } = list.query;

  const actionsFor = (task: TaskSummaryDto): MenuItem[] => [
    { label: TASK_REQUEST_COPY.actions.open, icon: IconName.ARROW_UP_RIGHT, onSelect: () => router.push(taskDetailPath(task.id)) },
    ...lifecycleMenuItems(task, summaryAvailableActions(task), actions),
  ];

  const newRequestLink = (
    <ButtonLink href={RoutePath.TASKS_NEW} leadingIcon={IconName.PLUS}>
      {COPY.newRequest}
    </ButtonLink>
  );

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
            placeholder={COPY.searchPlaceholder}
            aria-label={COPY.searchPlaceholder}
            className="lg:max-w-80"
          />
          <div className="overflow-x-auto">
            <SegmentedControl
              label={COPY.statusFilterLabel}
              options={STATUS_OPTIONS}
              value={list.status ?? ALL_STATUSES}
              onValueChange={(value) => list.setStatus(value === ALL_STATUSES ? null : value)}
            />
          </div>
        </div>
        <div className="self-start xl:self-auto">{newRequestLink}</div>
      </div>

      <QueryState data={data} error={error} isLoading={isLoading} loadingLabel={COPY.loading} errorMessage={COPY.loadFailed} onRetry={() => void mutate()}>
        {(result) => {
          if (result.page.total === 0 && !list.isFiltered) {
            return <EmptyState title={COPY.emptyTitle} body={COPY.emptyBody} action={newRequestLink} />;
          }
          if (result.tasks.length === 0) return <NoMatchingResults message={COPY.noMatches} />;
          return (
            <>
              <TaskRequestTable tasks={result.tasks} actionsFor={actionsFor} />
              <Pagination
                label={COPY.paginationLabel}
                total={result.page.total}
                limit={result.page.limit}
                offset={result.page.offset}
                onOffsetChange={list.setOffset}
              />
            </>
          );
        }}
      </QueryState>

      <TaskRequestActionDialog actions={actions} />
    </>
  );
}
