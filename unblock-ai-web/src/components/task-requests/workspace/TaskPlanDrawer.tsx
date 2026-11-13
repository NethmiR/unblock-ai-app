"use client";
import { useState } from "react";
import { DateTime } from "@/components/ui/DateTime";
import { Drawer } from "@/components/ui/Drawer";
import { Icon } from "@/components/ui/icons/Icon";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/SegmentedControl";
import { WorkflowFlowchart } from "@/components/workflow-templates/flowchart/WorkflowFlowchart";
import { ApprovalDecisionBadge, TaskStepStatusBadge } from "@/components/task-requests/shared/TaskStatusBadges";
import { useTaskWorkflowDefinition } from "@/lib/hooks/useTaskRequest";
import { assigneeDisplayName } from "@/lib/task-request/assignee-presentation";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { TASK_STEP_KIND_PRESENTATION } from "@/lib/task-request/task-status-presentation";
import type { TaskDto } from "@/types/task";

const COPY = TASK_REQUEST_COPY.plan;

enum PlanView {
  STEPS = "steps",
  FLOW = "flow",
}

const VIEW_OPTIONS: readonly SegmentedOption<PlanView>[] = [
  { value: PlanView.STEPS, label: COPY.steps },
  { value: PlanView.FLOW, label: COPY.flow },
];

function PlanSteps({ task }: { task: TaskDto }) {
  return (
    <ol className="space-y-3">
      {task.steps.map((step) => (
        <li key={step.id} className="rounded-card border border-line-admin px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
              <Icon name={TASK_STEP_KIND_PRESENTATION[step.kind].icon} className="h-4 w-4 text-muted" />
              {step.name}
            </span>
            <TaskStepStatusBadge status={step.status} />
          </div>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[12.5px]">
            <dt className="text-muted">{COPY.assignee}</dt>
            <dd className="text-ink">{step.assignee ? assigneeDisplayName(step.assignee) : COPY.noAssignee}</dd>
            {step.activated_at && (
              <>
                <dt className="text-muted">{COPY.activated}</dt>
                <dd className="text-ink">
                  <DateTime iso={step.activated_at} />
                </dd>
              </>
            )}
            {step.completed_at && (
              <>
                <dt className="text-muted">{COPY.finished}</dt>
                <dd className="text-ink">
                  <DateTime iso={step.completed_at} />
                </dd>
              </>
            )}
            {step.approval?.comment && (
              <>
                <dt className="text-muted">{COPY.comment}</dt>
                <dd className="whitespace-pre-wrap text-ink">{step.approval.comment}</dd>
              </>
            )}
          </dl>
          {step.approval?.decision && (
            <div className="mt-2">
              <ApprovalDecisionBadge decision={step.approval.decision} />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function PlanFlow({ taskId }: { taskId: string }) {
  const { data, error, isLoading, mutate } = useTaskWorkflowDefinition(taskId);
  return (
    <QueryState data={data} error={error} isLoading={isLoading} loadingLabel={COPY.flowLoading} errorMessage={COPY.flowFailed} onRetry={() => void mutate()}>
      {(response) => (
        <div className="h-[560px] overflow-hidden rounded-card border border-line-admin">
          <WorkflowFlowchart definition={response.definition} />
        </div>
      )}
    </QueryState>
  );
}

export function TaskPlanDrawer({ task, onClose }: { task: TaskDto; onClose: () => void }) {
  const [view, setView] = useState<PlanView>(PlanView.STEPS);
  return (
    <Drawer title={COPY.title} description={COPY.description} onClose={onClose}>
      <div className="mb-4">
        <SegmentedControl label={COPY.viewLabel} options={VIEW_OPTIONS} value={view} onValueChange={setView} />
      </div>
      {view === PlanView.STEPS ? <PlanSteps task={task} /> : <PlanFlow taskId={task.id} />}
    </Drawer>
  );
}
