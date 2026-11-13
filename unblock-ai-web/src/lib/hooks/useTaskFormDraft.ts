"use client";
import { useReducer, useState } from "react";
import { mutate } from "swr";
import { useToast } from "@/components/providers/ToastProvider";
import { apiErrorDetails } from "@/lib/api/api-error";
import { revalidateApiPaths } from "@/lib/api/swr-cache";
import { TASKS_PATH, taskPath, tasksApi } from "@/lib/api/tasks";
import { hasErrorCode, taskRequestErrorMessage } from "@/lib/task-request/task-error-message";
import { parseFieldIssues } from "@/lib/task-request/task-field-issue-message";
import { taskFieldValues, todayIsoDate, validateFormDraft } from "@/lib/task-request/task-field-validation";
import {
  TaskFormDraftActionKind,
  allRequestValues,
  changedValues,
  editableFields,
  formBaselineKey,
  initialDraftFromForm,
  isDraftDirty,
  taskFormDraftReducer,
  type TaskFormDraftValue,
} from "@/lib/task-request/task-form-draft";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { TaskErrorCode, type TaskDto } from "@/types/task";
import { FormValidationMode, type FormFieldIssueDto, type TaskFieldValueDto, type TaskFormDto } from "@/types/task-form";

const COPY = TASK_REQUEST_COPY.forms;

export interface TaskFormDraftMessages {
  saved: string;
  submitted: string;
}

export interface TaskFormDraft {
  values: Readonly<Record<string, TaskFormDraftValue>>;
  issues: Readonly<Record<string, FormFieldIssueDto>>;
  isDirty: boolean;
  isSaving: boolean;
  isSubmitting: boolean;
  setValue: (fieldId: string, value: TaskFormDraftValue) => void;
  discard: () => void;
  saveDraft: () => Promise<void>;
  submit: () => Promise<TaskDto | null>;
}

export function useTaskFormDraft(task: TaskDto, form: TaskFormDto, messages: TaskFormDraftMessages): TaskFormDraft {
  const toast = useToast();
  const [state, dispatch] = useReducer(taskFormDraftReducer, form, initialDraftFromForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (state.baselineKey !== formBaselineKey(form)) dispatch({ kind: TaskFormDraftActionKind.RESET, form });

  const validate = (values: Record<string, TaskFieldValueDto>, mode: FormValidationMode): boolean => {
      const issues = validateFormDraft({ fields: editableFields(form), values, allValues: taskFieldValues(task.forms), mode, today: todayIsoDate() });
      dispatch({ kind: TaskFormDraftActionKind.ISSUES_SET, issues });
      return issues.length === 0;
    };

  const adopt = async (updated: TaskDto) => {
    await mutate(taskPath(updated.id), updated, { revalidate: false });
    void revalidateApiPaths(`${TASKS_PATH}?`);
  };

  const handleError = (err: unknown, fallback: string) => {
      if (hasErrorCode(err, TaskErrorCode.TASK_FORM_INVALID)) {
        dispatch({ kind: TaskFormDraftActionKind.ISSUES_SET, issues: parseFieldIssues(apiErrorDetails(err)) });
        toast.error(COPY.fixIssues);
        return;
      }
      if (hasErrorCode(err, TaskErrorCode.TASK_REVISION_CONFLICT)) void mutate(taskPath(task.id));
      toast.error(taskRequestErrorMessage(err, fallback));
    };

  const saveDraft = async () => {
    const values = changedValues(state);
    if (Object.keys(values).length === 0) return;
    if (!validate(values, FormValidationMode.DRAFT)) {
      toast.error(COPY.fixIssues);
      return;
    }
    setIsSaving(true);
    try {
      await adopt(await tasksApi.saveDraft(task.id, form.id, values));
      toast.success(messages.saved);
    } catch (err) {
      handleError(err, COPY.draftFailed);
    } finally {
      setIsSaving(false);
    }
  };

  const submit = async (): Promise<TaskDto | null> => {
    const values = allRequestValues(state);
    if (!validate(values, FormValidationMode.SUBMIT)) {
      toast.error(COPY.fixIssues);
      return null;
    }
    setIsSubmitting(true);
    try {
      const updated = await tasksApi.submitForm(task.id, form.id, values);
      await adopt(updated);
      toast.success(messages.submitted);
      return updated;
    } catch (err) {
      handleError(err, COPY.submitFailed);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    values: state.values,
    issues: state.issues,
    isDirty: isDraftDirty(state),
    isSaving,
    isSubmitting,
    setValue: (fieldId: string, value: TaskFormDraftValue) => dispatch({ kind: TaskFormDraftActionKind.FIELD_CHANGED, fieldId, value }),
    discard: () => dispatch({ kind: TaskFormDraftActionKind.RESET, form }),
    saveDraft,
    submit,
  };
}
