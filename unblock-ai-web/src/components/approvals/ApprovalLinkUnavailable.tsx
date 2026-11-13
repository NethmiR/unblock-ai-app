import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/icons/Icon";
import { ApproverHeader } from "./ApproverView";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { IconName } from "@/types/icon";

export enum ApprovalLinkUnavailableReason {
  INVALID = "invalid",
  EXPIRED = "expired",
}

const COPY = TASK_REQUEST_COPY.approver.unavailable;

const PRESENTATION: Record<ApprovalLinkUnavailableReason, { title: string; body: string; icon: IconName }> = {
  [ApprovalLinkUnavailableReason.INVALID]: { title: COPY.invalidTitle, body: COPY.invalidBody, icon: IconName.CROSS_CIRCLE },
  [ApprovalLinkUnavailableReason.EXPIRED]: { title: COPY.expiredTitle, body: COPY.expiredBody, icon: IconName.CLOCK },
};

export function ApprovalLinkUnavailable({ reason }: { reason: ApprovalLinkUnavailableReason }) {
  const presentation = PRESENTATION[reason];
  return (
    <>
      <ApproverHeader />
      <main className="mx-auto max-w-[640px] px-4 py-16 sm:px-6">
        <EmptyState
          illustration={
            <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-bg text-muted">
              <Icon name={presentation.icon} className="h-6 w-6" />
            </span>
          }
          title={presentation.title}
          body={presentation.body}
        />
      </main>
    </>
  );
}
