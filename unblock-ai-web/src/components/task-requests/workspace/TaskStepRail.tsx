import { Button } from "@/components/ui/Button";
import { TaskStepRailItem } from "./TaskStepRailItem";
import { stepNumber } from "@/lib/task-request/task-progress";
import { requestedByName } from "@/lib/task-request/task-step-context";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { IconName } from "@/types/icon";
import type { TaskDto } from "@/types/task";

const COPY = TASK_REQUEST_COPY.workspace;

interface TaskStepRailProps {
  task: TaskDto;
  selectedStepId: string | null;
  onViewPlan: () => void;
}

export function TaskStepRail({ task, selectedStepId, onViewPlan }: TaskStepRailProps) {
  return (
    <nav aria-label={COPY.railLabel} className="flex flex-col gap-4">
      <ol className="space-y-0.5">
        {task.steps.map((step) => (
          <TaskStepRailItem
            key={step.id}
            taskId={task.id}
            step={step}
            number={stepNumber(step, task)}
            isSelected={step.id === selectedStepId}
            requestedBy={requestedByName(step, task)}
          />
        ))}
      </ol>
      <Button type="button" variant="secondary" size="sm" leadingIcon={IconName.LIST} onClick={onViewPlan}>
        {COPY.viewPlan}
      </Button>
    </nav>
  );
}
