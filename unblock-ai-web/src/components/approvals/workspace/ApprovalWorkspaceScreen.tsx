"use client";
import { useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/providers/ToastProvider";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/icons/Icon";
import { QueryState } from "@/components/ui/QueryState";
import { ApproverDetailLayout } from "@/components/approvals/ApproverDetailLayout";
import { APPROVER_APPROVALS_PATH, approverApprovalsApi } from "@/lib/api/approvals";
import { revalidateApiPaths } from "@/lib/api/swr-cache";
import { isApprovalUnavailable, useApprovalAssignment } from "@/lib/hooks/useApprovalAssignment";
import { usePageHeading } from "@/lib/hooks/usePageHeading";
import { RoutePath } from "@/lib/routing/route-path";
import { taskRequestErrorMessage } from "@/lib/task-request/task-error-message";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { IconName } from "@/types/icon";
import type { ApprovalDecisionInputDto, ApprovalDecisionResultDto, ApproverViewDto } from "@/types/approval";

const COPY = TASK_REQUEST_COPY.approvals.workspace;

interface ApprovalWorkspaceScreenProps {
  taskId: string;
  stepId: string;
}

function BackLink({ toHistory }: { toHistory: boolean }) {
  return (
    <Link
      href={toHistory ? RoutePath.APPROVALS_HISTORY : RoutePath.APPROVALS}
      className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-muted transition-colors hover:text-ink"
    >
      <Icon name={IconName.CHEVRON_RIGHT} className="h-4 w-4 rotate-180" />
      {toHistory ? COPY.backToHistory : COPY.backToPending}
    </Link>
  );
}

function ApprovalUnavailable() {
  return (
    <EmptyState
      title={COPY.unavailableTitle}
      body={COPY.unavailableBody}
      action={
        <ButtonLink href={RoutePath.APPROVALS} leadingIcon={IconName.INBOX}>
          {COPY.goToPending}
        </ButtonLink>
      }
    />
  );
}

function ApprovalWorkspace({ taskId, stepId, view }: ApprovalWorkspaceScreenProps & { view: ApproverViewDto }) {
  const toast = useToast();
  const [decidedHere, setDecidedHere] = useState(false);
  const [wasDecidedOnOpen] = useState(() => view.decided !== null);

  const decide = (input: ApprovalDecisionInputDto): Promise<ApprovalDecisionResultDto> => approverApprovalsApi.decide(taskId, stepId, input);

  const handleDecided = (result: ApprovalDecisionResultDto | null): void => {
    setDecidedHere(true);
    if (result !== null) toast.success(COPY.decided);
    void revalidateApiPaths(APPROVER_APPROVALS_PATH);
  };

  const isDecided = decidedHere || view.decided !== null;

  return (
    <div className="flex flex-col gap-5">
      <BackLink toHistory={wasDecidedOnOpen} />
      <ApproverDetailLayout
        view={view}
        onDecide={decide}
        onDecided={handleDecided}
        footer={
          isDecided && !wasDecidedOnOpen ? (
            <ButtonLink href={RoutePath.APPROVALS} variant="secondary" leadingIcon={IconName.INBOX}>
              {COPY.backToPending}
            </ButtonLink>
          ) : null
        }
      />
    </div>
  );
}

export function ApprovalWorkspaceScreen({ taskId, stepId }: ApprovalWorkspaceScreenProps) {
  const { data, error, isLoading, mutate } = useApprovalAssignment(taskId, stepId);
  usePageHeading(data ? { title: data.task.title, description: COPY.headingDescription } : null);

  if (data === undefined && isApprovalUnavailable(error)) return <ApprovalUnavailable />;

  return (
    <QueryState
      data={data}
      error={error}
      isLoading={isLoading}
      loadingLabel={COPY.loading}
      errorMessage={taskRequestErrorMessage(error, COPY.loadFailed)}
      onRetry={() => void mutate()}
    >
      {(view) => <ApprovalWorkspace taskId={taskId} stepId={stepId} view={view} />}
    </QueryState>
  );
}
