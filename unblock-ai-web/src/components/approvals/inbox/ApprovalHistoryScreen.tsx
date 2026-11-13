"use client";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { QueryState } from "@/components/ui/QueryState";
import { SearchInput } from "@/components/ui/SearchInput";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/SegmentedControl";
import { NoMatchingResults } from "@/components/organisation/shared/NoMatchingResults";
import { ApprovalAssignmentTable } from "./ApprovalAssignmentTable";
import { useApprovalHistory } from "@/lib/hooks/useApprovalHistory";
import { APPROVAL_DECISION_ORDER } from "@/lib/task-request/approver-decision";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { ApprovalAssignmentState } from "@/types/approval";
import { ApprovalDecision } from "@/types/task";

const COPY = TASK_REQUEST_COPY.approvals.history;
const ALL_DECISIONS = "all";

type DecisionFilter = ApprovalDecision | typeof ALL_DECISIONS;

const DECISION_FILTER_LABELS: Record<ApprovalDecision, string> = {
  [ApprovalDecision.APPROVED]: COPY.decisionFilter.approved,
  [ApprovalDecision.REJECTED]: COPY.decisionFilter.rejected,
  [ApprovalDecision.REQUEST_MORE_INFO]: COPY.decisionFilter.request_more_info,
};

const DECISION_OPTIONS: readonly SegmentedOption<DecisionFilter>[] = [
  { value: ALL_DECISIONS, label: COPY.all },
  ...APPROVAL_DECISION_ORDER.map((decision) => ({ value: decision, label: DECISION_FILTER_LABELS[decision] })),
];

export function ApprovalHistoryScreen() {
  const history = useApprovalHistory();
  const { data, error, isLoading, mutate } = history.query;

  return (
    <>
      <div className="mb-5 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput
          value={history.search}
          onChange={(event) => history.setSearch(event.target.value)}
          placeholder={COPY.searchPlaceholder}
          aria-label={COPY.searchPlaceholder}
          className="lg:max-w-80"
        />
        <div className="overflow-x-auto">
          <SegmentedControl
            label={COPY.decisionFilterLabel}
            options={DECISION_OPTIONS}
            value={history.decision ?? ALL_DECISIONS}
            onValueChange={(value) => history.setDecision(value === ALL_DECISIONS ? null : value)}
          />
        </div>
      </div>

      <QueryState data={data} error={error} isLoading={isLoading} loadingLabel={COPY.loading} errorMessage={COPY.loadFailed} onRetry={() => void mutate()}>
        {(result) => {
          if (result.page.total === 0 && !history.isFiltered) return <EmptyState title={COPY.emptyTitle} body={COPY.emptyBody} />;
          if (result.approvals.length === 0) return <NoMatchingResults message={COPY.noMatches} />;
          return (
            <>
              <ApprovalAssignmentTable mode={ApprovalAssignmentState.DECIDED} rows={result.approvals} />
              <Pagination
                label={COPY.paginationLabel}
                total={result.page.total}
                limit={result.page.limit}
                offset={result.page.offset}
                onOffsetChange={history.setOffset}
              />
            </>
          );
        }}
      </QueryState>
    </>
  );
}
