"use client";
import type { ReactNode } from "react";
import { ApproverCard } from "./ApproverCard";
import { AutomaticStepPanel } from "./AutomaticStepPanel";
import { FormStepPanel } from "./FormStepPanel";
import { InformationRequestPanel } from "./InformationRequestPanel";
import { stepNumber } from "@/lib/task-request/task-progress";
import { stepPanelHeading } from "@/lib/task-request/task-step-context";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { TaskStepKind, type TaskDto, type TaskStepDto } from "@/types/task";

const COPY = TASK_REQUEST_COPY.workspace;

interface TaskStepPanelProps {
  task: TaskDto;
  step: TaskStepDto;
  actions: ReactNode;
  onSubmitted: (task: TaskDto) => void;
}

function StepBody({ task, step, onSubmitted }: Omit<TaskStepPanelProps, "actions">) {
  switch (step.kind) {
    case TaskStepKind.FORM: {
      const form = task.forms.find((candidate) => candidate.id === step.form_id);
      return form ? <FormStepPanel key={form.id} task={task} form={form} onSubmitted={onSubmitted} /> : null;
    }
    case TaskStepKind.APPROVAL:
      return <ApproverCard step={step} />;
    case TaskStepKind.INFORMATION_REQUEST:
      return <InformationRequestPanel key={step.id} task={task} step={step} onSubmitted={onSubmitted} />;
    case TaskStepKind.NOTIFICATION:
    case TaskStepKind.AUTOMATED_ACTION:
      return <AutomaticStepPanel kind={step.kind} />;
    default: {
      const unreachable: never = step.kind;
      return unreachable;
    }
  }
}

export function TaskStepPanel({ task, step, actions, onSubmitted }: TaskStepPanelProps) {
  const number = stepNumber(step, task);
  const { heading, subline } = stepPanelHeading(step);

  return (
    <section aria-labelledby={`step-${step.id}-heading`}>
      <header className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[.07em] text-muted">
            {number ? COPY.stepOf(number.number, number.total) : COPY.notCounted} · {step.name}
          </p>
          <h2 id={`step-${step.id}-heading`} className="mt-1 text-[20px] font-bold tracking-tight text-ink">
            {heading}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">{step.description ?? subline}</p>
        </div>
        {actions}
      </header>
      <StepBody task={task} step={step} onSubmitted={onSubmitted} />
    </section>
  );
}
