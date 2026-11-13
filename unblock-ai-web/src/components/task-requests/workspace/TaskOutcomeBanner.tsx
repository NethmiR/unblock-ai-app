import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons/Icon";
import { assigneeDisplayName } from "@/lib/task-request/assignee-presentation";
import { rejectingStep } from "@/lib/task-request/task-step-context";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { cn } from "@/lib/utils/cn";
import { IconName } from "@/types/icon";
import { TaskStatus, type TaskDto } from "@/types/task";

const COPY = TASK_REQUEST_COPY.outcome;

interface TaskOutcomeBannerProps {
  task: TaskDto;
  isDownloading: boolean;
  onDownloadTranscript: () => void;
}

function Banner({ tone, icon, title, children }: { tone: string; icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <div role="status" className={cn("flex flex-col gap-3 rounded-card border px-4 py-3.5 sm:flex-row sm:items-start", tone)}>
      <Icon name={icon} className="mt-0.5 h-5 w-5" />
      <div className="min-w-0 flex-1 text-[13.5px] leading-relaxed">
        <p className="font-semibold">{title}</p>
        {children}
      </div>
    </div>
  );
}

export function TaskOutcomeBanner({ task, isDownloading, onDownloadTranscript }: TaskOutcomeBannerProps) {
  switch (task.status) {
    case TaskStatus.IN_PROGRESS:
      return null;
    case TaskStatus.COMPLETED:
      return (
        <Banner tone="border-success/30 bg-success/5 text-ink" icon={IconName.CHECK_CIRCLE} title={COPY.completedTitle}>
          <p className="text-muted">{COPY.completedBody}</p>
          {task.available_actions.can_download_transcript && (
            <Button type="button" size="sm" className="mt-2" leadingIcon={IconName.DOWNLOAD} disabled={isDownloading} onClick={onDownloadTranscript}>
              {isDownloading ? TASK_REQUEST_COPY.actions.downloading : TASK_REQUEST_COPY.actions.downloadTranscript}
            </Button>
          )}
        </Banner>
      );
    case TaskStatus.REJECTED: {
      const step = rejectingStep(task);
      const name = step?.assignee ? assigneeDisplayName(step.assignee) : null;
      const summary = step ? (name ? COPY.rejectedBy(name, step.name) : COPY.rejectedAt(step.name)) : COPY.rejectedFallback;
      return (
        <Banner tone="border-danger/30 bg-danger/5 text-ink" icon={IconName.CROSS_CIRCLE} title={COPY.rejectedTitle}>
          <p className="text-muted">{summary}</p>
          {step?.approval?.comment && <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-danger/40 pl-3 text-ink">{step.approval.comment}</blockquote>}
        </Banner>
      );
    }
    case TaskStatus.CANCELLED:
      return (
        <Banner tone="border-line-admin bg-bg text-ink" icon={IconName.CROSS_CIRCLE} title={COPY.cancelledTitle}>
          <p className="text-muted">{COPY.cancelledBody}</p>
        </Banner>
      );
    default: {
      const unreachable: never = task.status;
      return unreachable;
    }
  }
}
