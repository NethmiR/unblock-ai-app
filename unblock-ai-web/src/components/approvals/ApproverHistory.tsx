import { Card } from "@/components/ui/Card";
import { DateTime } from "@/components/ui/DateTime";
import { ApprovalDecisionBadge } from "@/components/task-requests/shared/TaskStatusBadges";
import { ApproverSectionHeading } from "./ApproverSection";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import type { ApproverViewDto } from "@/types/approval";

const COPY = TASK_REQUEST_COPY.approver;

export function ApproverHistory({ history }: { history: ApproverViewDto["history"] }) {
  if (history.length === 0) return null;
  return (
    <Card className="px-5 py-4">
      <ApproverSectionHeading>{COPY.historyHeading}</ApproverSectionHeading>
      <ol className="divide-y divide-line-admin">
        {history.map((entry, index) => (
          <li key={`${entry.at}-${index}`} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-ink">{entry.step_name}</p>
                {entry.actor_name && <p className="text-[12.5px] text-muted">{entry.actor_name}</p>}
              </div>
              {entry.decision && <ApprovalDecisionBadge decision={entry.decision} />}
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-ink">{entry.comment ?? <span className="text-muted">{COPY.noComment}</span>}</p>
            <p className="mt-1 text-[12px] text-muted">
              <DateTime iso={entry.at} />
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
