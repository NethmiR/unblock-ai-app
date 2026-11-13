"use client";
import { Button } from "@/components/ui/Button";
import { DateTime } from "@/components/ui/DateTime";
import { LeavePageDialog } from "@/components/ui/LeavePageDialog";
import { Notice } from "@/components/ui/Notice";
import { UnsavedChangesBar } from "@/components/ui/UnsavedChangesBar";
import { TaskForm } from "./TaskForm";
import { useTaskFormDraft } from "@/lib/hooks/useTaskFormDraft";
import { useUnsavedChangesGuard } from "@/lib/hooks/useUnsavedChangesGuard";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { IconName } from "@/types/icon";
import type { TaskDto } from "@/types/task";
import type { TaskFormDto } from "@/types/task-form";

const COPY = TASK_REQUEST_COPY.forms;

export interface TaskFormEditorLabels {
  submit: string;
  submitting: string;
  submitted: string;
}

interface TaskFormEditorProps {
  task: TaskDto;
  form: TaskFormDto;
  labels: TaskFormEditorLabels;
  onSubmitted: (task: TaskDto) => void;
}

export function TaskFormEditor({ task, form, labels, onSubmitted }: TaskFormEditorProps) {
  const draft = useTaskFormDraft(task, form, { saved: COPY.draftSaved, submitted: labels.submitted });
  const guard = useUnsavedChangesGuard(draft.isDirty);
  const busy = draft.isSaving || draft.isSubmitting;

  async function submit(): Promise<void> {
    const updated = await draft.submit();
    if (updated) onSubmitted(updated);
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (form.submittable && !busy) void submit();
      }}
    >
      {!form.submittable && (
        <Notice className="mb-5">{COPY.notYetSubmittable}</Notice>
      )}

      <TaskForm form={form} readOnly={false} values={draft.values} issues={draft.issues} onChange={draft.setValue} />

      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line-admin pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] text-muted">
          {form.saved_at && (
            <>
              {COPY.lastSaved} <DateTime iso={form.saved_at} />
            </>
          )}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" leadingIcon={IconName.DOCUMENT} disabled={!draft.isDirty || busy} onClick={() => void draft.saveDraft()}>
            {draft.isSaving ? COPY.savingDraft : COPY.saveDraft}
          </Button>
          {form.submittable && (
            <Button type="submit" leadingIcon={IconName.SEND} disabled={busy}>
              {draft.isSubmitting ? labels.submitting : labels.submit}
            </Button>
          )}
        </div>
      </div>

      {draft.isDirty && <UnsavedChangesBar busy={busy} onDiscard={draft.discard} onSave={() => void draft.saveDraft()} />}
      <LeavePageDialog guard={guard} />
    </form>
  );
}
