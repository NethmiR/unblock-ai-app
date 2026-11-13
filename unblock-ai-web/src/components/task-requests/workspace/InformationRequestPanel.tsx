"use client";
import { DateTime } from "@/components/ui/DateTime";
import { FormStepPanel } from "./FormStepPanel";
import { assigneeDisplayName } from "@/lib/task-request/assignee-presentation";
import { informationRequester } from "@/lib/task-request/task-step-context";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import type { TaskFormEditorLabels } from "@/components/task-requests/forms/TaskFormEditor";
import type { TaskDto, TaskStepDto } from "@/types/task";

const COPY = TASK_REQUEST_COPY.informationRequest;
const ANSWER_LABELS: TaskFormEditorLabels = {
  submit: TASK_REQUEST_COPY.forms.sendAnswer,
  submitting: TASK_REQUEST_COPY.forms.sendingAnswer,
  submitted: TASK_REQUEST_COPY.forms.answerSent,
};

interface InformationRequestPanelProps {
  task: TaskDto;
  step: TaskStepDto;
  onSubmitted: (task: TaskDto) => void;
}

export function InformationRequestPanel({ task, step, onSubmitted }: InformationRequestPanelProps) {
  const requester = informationRequester(step, task);
  const askerName = requester?.assignee ? assigneeDisplayName(requester.assignee) : COPY.unknownAsker;
  const designation = requester?.assignee?.designation_title ?? null;
  const askedAt = requester?.approval?.decided_at ?? step.activated_at;
  const form = task.forms.find((candidate) => candidate.id === step.form_id) ?? null;

  return (
    <div className="space-y-5">
      {step.information_request && (
        <figure className="rounded-card border-l-4 border-warn bg-warn-bg/60 px-4 py-3">
          <figcaption className="text-[12.5px] font-semibold text-warn-ink">
            {COPY.askedBy(designation ? `${askerName} (${designation})` : askerName)}
            {askedAt && (
              <>
                {" · "}
                <DateTime iso={askedAt} />
              </>
            )}
          </figcaption>
          <blockquote className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{step.information_request.question}</blockquote>
        </figure>
      )}
      {form && <FormStepPanel task={task} form={form} labels={ANSWER_LABELS} onSubmitted={onSubmitted} />}
    </div>
  );
}
