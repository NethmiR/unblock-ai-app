import { StepStatusMarker } from "@/components/task-requests/workspace/TaskStepRailItem";
import { ApproverSectionHeading } from "./ApproverSection";
import { assigneeDisplayName } from "@/lib/task-request/assignee-presentation";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { TASK_STEP_KIND_PRESENTATION, TASK_STEP_STATUS_PRESENTATION } from "@/lib/task-request/task-status-presentation";
import { cn } from "@/lib/utils/cn";
import { TaskStepStatus } from "@/types/task";
import type { ApproverViewDto } from "@/types/approval";

const COPY = TASK_REQUEST_COPY.approver;

export function ApproverPlanRail({ plan }: { plan: ApproverViewDto["plan"] }) {
  return (
    <nav aria-label={COPY.planLabel}>
      <ApproverSectionHeading>{COPY.planHeading}</ApproverSectionHeading>
      <ol className="space-y-0.5">
        {plan.map((step, index) => (
          <li
            key={`${step.name}-${index}`}
            aria-current={step.is_current ? "step" : undefined}
            className={cn("flex items-start gap-3 rounded-control px-2.5 py-2.5", step.is_current && "bg-accent/5")}
          >
            <StepStatusMarker status={step.status} />
            <span className="min-w-0 flex-1">
              <span className="block text-[10.5px] font-bold uppercase tracking-[.07em] text-faint">
                {step.is_current ? COPY.currentStep : TASK_STEP_STATUS_PRESENTATION[step.status].label}
              </span>
              <span className={cn("block text-[13.5px] font-semibold", step.status === TaskStepStatus.SKIPPED ? "text-muted line-through" : "text-ink")}>
                {step.name}
              </span>
              <span className="block text-[11.5px] text-muted">
                {step.assignee ? assigneeDisplayName(step.assignee) : TASK_STEP_KIND_PRESENTATION[step.kind].label}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
