"use client";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { QueryState } from "@/components/ui/QueryState";
import { SearchInput } from "@/components/ui/SearchInput";
import { NoMatchingResults } from "@/components/organisation/shared/NoMatchingResults";
import { ApprovalAssignmentTable } from "./ApprovalAssignmentTable";
import { useApprovalInbox } from "@/lib/hooks/useApprovalInbox";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { ApprovalAssignmentState } from "@/types/approval";

const COPY = TASK_REQUEST_COPY.approvals.inbox;

export function ApprovalInboxScreen() {
  const inbox = useApprovalInbox();
  const { data, error, isLoading, mutate } = inbox.query;

  return (
    <>
      <div className="mb-5">
        <SearchInput
          value={inbox.search}
          onChange={(event) => inbox.setSearch(event.target.value)}
          placeholder={COPY.searchPlaceholder}
          aria-label={COPY.searchPlaceholder}
          className="lg:max-w-96"
        />
      </div>

      <QueryState data={data} error={error} isLoading={isLoading} loadingLabel={COPY.loading} errorMessage={COPY.loadFailed} onRetry={() => void mutate()}>
        {(result) => {
          if (result.page.total === 0 && !inbox.isFiltered) return <EmptyState title={COPY.emptyTitle} body={COPY.emptyBody} />;
          if (result.approvals.length === 0) return <NoMatchingResults message={COPY.noMatches} />;
          return (
            <>
              <ApprovalAssignmentTable mode={ApprovalAssignmentState.PENDING} rows={result.approvals} />
              <Pagination
                label={COPY.paginationLabel}
                total={result.page.total}
                limit={result.page.limit}
                offset={result.page.offset}
                onOffsetChange={inbox.setOffset}
              />
            </>
          );
        }}
      </QueryState>
    </>
  );
}
