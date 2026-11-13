import Link from "next/link";
import { Icon } from "@/components/ui/icons/Icon";
import { taskDetailPath } from "@/lib/routing/route-path";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { TASK_STEP_STATUS_PRESENTATION } from "@/lib/task-request/task-status-presentation";
import { cn } from "@/lib/utils/cn";
import { IconName } from "@/types/icon";
import { TaskStepStatus, type TaskStepDto } from "@/types/task";
import type { StepNumber } from "@/lib/task-request/task-progress";

const COPY = TASK_REQUEST_COPY.workspace;

export function StepStatusMarker({ status }: { status: TaskStepStatus }) {
  switch (status) {
    case TaskStepStatus.COMPLETED:
      return (
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-success text-white">
          <Icon name={IconName.CHECK} className="h-3.5 w-3.5" />
        </span>
      );
    case TaskStepStatus.AWAITING_REQUESTER:
    case TaskStepStatus.AWAITING_APPROVER:
      return (
        <span className="relative flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 border-accent">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
        </span>
      );
    case TaskStepStatus.SKIPPED:
    case TaskStepStatus.CANCELLED:
      return (
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-line-admin">
          <span className="h-0.5 w-2.5 rounded bg-faint" />
        </span>
      );
    case TaskStepStatus.UPCOMING:
      return <span className="h-6 w-6 flex-none rounded-full border-2 border-line-admin bg-surface" />;
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

interface TaskStepRailItemProps {
  taskId: string;
  step: TaskStepDto;
  number: StepNumber | null;
  isSelected: boolean;
  requestedBy: string | null;
}

export function TaskStepRailItem({ taskId, step, number, isSelected, requestedBy }: TaskStepRailItemProps) {
  const isInserted = requestedBy !== null;
  return (
    <li className={cn(isInserted && "pl-5")}>
      <Link
        href={taskDetailPath(taskId, step.id)}
        scroll={false}
        aria-current={isSelected ? "step" : undefined}
        className={cn(
          "flex items-start gap-3 rounded-control px-2.5 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          isSelected ? "bg-accent/5" : "hover:bg-bg",
        )}
      >
        <StepStatusMarker status={step.status} />
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-bold uppercase tracking-[.07em] text-faint">
            {number ? COPY.stepOf(number.number, number.total) : TASK_STEP_STATUS_PRESENTATION[step.status].label}
          </span>
          <span className={cn("block text-[13.5px] font-semibold", step.status === TaskStepStatus.SKIPPED ? "text-muted line-through" : "text-ink")}>
            {step.name}
          </span>
          {requestedBy && <span className="block text-[11.5px] text-muted">{COPY.requestedBy(requestedBy)}</span>}
        </span>
      </Link>
    </li>
  );
}
