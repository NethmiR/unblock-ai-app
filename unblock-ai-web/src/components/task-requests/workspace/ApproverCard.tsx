import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DateTime } from "@/components/ui/DateTime";
import { Icon } from "@/components/ui/icons/Icon";
import { ApprovalDecisionBadge } from "@/components/task-requests/shared/TaskStatusBadges";
import { assigneeDisplayName } from "@/lib/task-request/assignee-presentation";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { IconName } from "@/types/icon";
import { TaskStepOrigin, TaskStepStatus, type TaskStepDto } from "@/types/task";

const COPY = TASK_REQUEST_COPY.approval;

export function ApproverCard({ step }: { step: TaskStepDto }) {
  const assignee = step.assignee;
  const approval = step.approval;
  return (
    <Card className="px-5 py-4">
      {step.origin === TaskStepOrigin.APPROVAL_REPEAT && <p className="mb-2 text-[12px] font-semibold text-accent">{COPY.reviewingAgain}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">{assignee ? assigneeDisplayName(assignee) : COPY.unknownApprover}</p>
          {assignee?.email && <p className="text-[12.5px] text-muted">{assignee.email}</p>}
          {assignee?.designation_title && (
            <p className="mt-1 text-[12.5px] text-muted">
              {COPY.reasonForApproval(
                assignee.organisational_unit_name ? `${assignee.designation_title}, ${assignee.organisational_unit_name}` : assignee.designation_title,
              )}
            </p>
          )}
        </div>
        {approval?.decision ? (
          <ApprovalDecisionBadge decision={approval.decision} />
        ) : (
          <Badge tone="warn" className="gap-1">
            <Icon name={IconName.CLOCK} className="h-3.5 w-3.5" />
            {COPY.awaitingDecision}
          </Badge>
        )}
      </div>
      <hr className="my-3 border-line-admin" />
      {approval?.comment ? (
        <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{approval.comment}</p>
      ) : (
        <p className="text-[13px] text-muted">{COPY.noRemarks}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
        {approval?.notified_at ? (
          <span>
            {COPY.sentOn} <DateTime iso={approval.notified_at} />
          </span>
        ) : (
          <span>{step.status === TaskStepStatus.AWAITING_APPROVER ? COPY.waitingInInbox : `${COPY.sentOn} ${COPY.notYetSent}`}</span>
        )}
        {approval?.decided_at && (
          <span>
            {COPY.decidedOn} <DateTime iso={approval.decided_at} />
          </span>
        )}
      </div>
    </Card>
  );
}
