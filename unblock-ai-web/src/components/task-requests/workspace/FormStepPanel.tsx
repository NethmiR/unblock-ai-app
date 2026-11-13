"use client";
import { Badge } from "@/components/ui/Badge";
import { DateTime } from "@/components/ui/DateTime";
import { TaskForm } from "@/components/task-requests/forms/TaskForm";
import { TaskFormEditor, type TaskFormEditorLabels } from "@/components/task-requests/forms/TaskFormEditor";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import type { TaskDto } from "@/types/task";
import type { TaskFormDto } from "@/types/task-form";

const COPY = TASK_REQUEST_COPY.forms;
const NO_ISSUES = {};
const NO_VALUES = {};

const FORM_LABELS: TaskFormEditorLabels = { submit: COPY.submit, submitting: COPY.submitting, submitted: COPY.submitted };

interface FormStepPanelProps {
  task: TaskDto;
  form: TaskFormDto;
  labels?: TaskFormEditorLabels;
  onSubmitted: (task: TaskDto) => void;
}

export function FormStepPanel({ task, form, labels = FORM_LABELS, onSubmitted }: FormStepPanelProps) {
  if (!form.editable) {
    return (
      <div>
        {form.submitted_at && (
          <p className="mb-4 flex items-center gap-2 text-[12.5px] text-muted">
            <Badge tone="success">{COPY.readOnly}</Badge>
            <DateTime iso={form.submitted_at} />
          </p>
        )}
        <TaskForm form={form} readOnly values={NO_VALUES} issues={NO_ISSUES} onChange={() => undefined} />
      </div>
    );
  }
  return <TaskFormEditor key={form.id} task={task} form={form} labels={labels} onSubmitted={onSubmitted} />;
}
