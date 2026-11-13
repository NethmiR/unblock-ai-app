"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CodeChip } from "@/components/ui/CodeChip";
import { QueryState } from "@/components/ui/QueryState";
import { Stepper } from "@/components/ui/Stepper";
import { TaskRequestActionDialog } from "@/components/task-requests/shared/TaskRequestActionDialog";
import { TaskStatusBadge } from "@/components/task-requests/shared/TaskStatusBadges";
import { TaskOutcomeBanner } from "./TaskOutcomeBanner";
import { TaskPlanDrawer } from "./TaskPlanDrawer";
import { TaskStepPanel } from "./TaskStepPanel";
import { TaskStepRail } from "./TaskStepRail";
import { TaskUnsupportedInputsNotice } from "./TaskUnsupportedInputsNotice";
import { TaskWorkspaceActions } from "./TaskWorkspaceActions";
import { usePageHeading } from "@/lib/hooks/usePageHeading";
import { useQueryParams } from "@/lib/hooks/useQueryParams";
import { useTaskRequest } from "@/lib/hooks/useTaskRequest";
import { useTaskRequestActions } from "@/lib/hooks/useTaskRequestActions";
import { RoutePath, TASK_STEP_QUERY_PARAMETER, taskDetailPath } from "@/lib/routing/route-path";
import { currentStepIndex, selectedStepId, visibleSteps } from "@/lib/task-request/task-progress";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { taskRequestErrorMessage } from "@/lib/task-request/task-error-message";
import type { TaskDto } from "@/types/task";

const COPY = TASK_REQUEST_COPY.workspace;

type StepParam = typeof TASK_STEP_QUERY_PARAMETER;

function TaskWorkspace({ task }: { task: TaskDto }) {
  const router = useRouter();
  const params = useQueryParams<StepParam>();
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const actions = useTaskRequestActions(() => router.push(RoutePath.TASKS));
  const stepId = selectedStepId(task, params.get(TASK_STEP_QUERY_PARAMETER));
  const step = task.steps.find((candidate) => candidate.id === stepId) ?? null;
  const counted = visibleSteps(task.steps);

  function handleSubmitted(updated: TaskDto): void {
    const next = selectedStepId(updated, null);
    if (next !== null) router.replace(taskDetailPath(updated.id, next), { scroll: false });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
        <CodeChip code={task.reference} />
        <TaskStatusBadge status={task.status} />
      </div>

      <TaskOutcomeBanner task={task} isDownloading={actions.downloadingId === task.id} onDownloadTranscript={() => void actions.downloadTranscript(task)} />
      <TaskUnsupportedInputsNotice inputs={task.unsupported_inputs} />

      <div className="overflow-x-auto pb-1 lg:hidden">
        <Stepper steps={counted.map((candidate) => candidate.name)} currentIndex={currentStepIndex(task)} label={COPY.stepperLabel} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {step && (
            <TaskStepPanel task={task} step={step} actions={<TaskWorkspaceActions task={task} actions={actions} />} onSubmitted={handleSubmitted} />
          )}
        </div>
        <aside className="hidden border-l border-line-admin pl-6 lg:block">
          <TaskStepRail task={task} selectedStepId={stepId} onViewPlan={() => setIsPlanOpen(true)} />
        </aside>
        <div className="lg:hidden">
          <TaskStepRail task={task} selectedStepId={stepId} onViewPlan={() => setIsPlanOpen(true)} />
        </div>
      </div>

      {isPlanOpen && <TaskPlanDrawer task={task} onClose={() => setIsPlanOpen(false)} />}
      <TaskRequestActionDialog actions={actions} />
    </div>
  );
}

export function TaskWorkspaceScreen({ taskId }: { taskId: string }) {
  const { data, error, isLoading, mutate } = useTaskRequest(taskId);
  usePageHeading(data ? { title: data.title, description: COPY.headingDescription } : null);

  return (
    <QueryState
      data={data}
      error={error}
      isLoading={isLoading}
      loadingLabel={COPY.loading}
      errorMessage={taskRequestErrorMessage(error, COPY.loadFailed)}
      onRetry={() => void mutate()}
    >
      {(task) => <TaskWorkspace task={task} />}
    </QueryState>
  );
}
