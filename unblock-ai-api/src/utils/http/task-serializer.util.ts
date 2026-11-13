import {
  ACTIVE_TASK_STEP_STATUSES,
  TaskStatus,
  TaskStepStatus,
  TERMINAL_TASK_STATUSES,
} from "../../data/constants/task.constant.js";
import { TaskFormStatus } from "../../data/constants/task-form.constant.js";
import type {
  RequesterSnapshot,
  TaskAssignee,
  TaskDocument,
  TaskStepRecord,
} from "../../lib/types/task/task-document.type.js";
import type { TaskFormRecord } from "../../lib/types/task/task-form.type.js";
import type {
  RequesterSnapshotDto,
  TaskAssigneeDto,
  TaskDto,
  TaskFormDto,
  TaskListResponseDto,
  TaskListPage,
  TaskProgressDto,
  TaskStepDto,
  TaskSummaryDto,
} from "../../lib/types/task/task-dto.type.js";

export interface TaskSerializationOptions {
  documentsEnabled: boolean;
  isDeletable: (task: TaskDocument) => boolean;
}

const UNCOUNTED_STEP_STATUSES: readonly TaskStepStatus[] = [TaskStepStatus.SKIPPED, TaskStepStatus.CANCELLED];

function iso(date: Date | null): string | null {
  return date === null ? null : date.toISOString();
}

export function serializeRequesterSnapshot(requester: RequesterSnapshot): RequesterSnapshotDto {
  return {
    full_name: requester.full_name,
    email: requester.email,
    units: requester.units.map((unit) => ({
      code: unit.code,
      name: unit.name,
      unit_type: unit.unit_type,
      parent_name: unit.parent_name,
      designation_titles: [...unit.designation_titles],
    })),
  };
}

export function serializeAssignee(assignee: TaskAssignee): TaskAssigneeDto {
  return {
    source: assignee.source,
    full_name: assignee.full_name,
    email: assignee.email,
    designation_title: assignee.designation_title,
    organisational_unit_name: assignee.organisational_unit_name,
    note: assignee.note,
  };
}

function isTerminal(task: TaskDocument): boolean {
  return TERMINAL_TASK_STATUSES.includes(task.status);
}

function serializeForm(form: TaskFormRecord, task: TaskDocument): TaskFormDto {
  const step = task.steps.find((candidate) => candidate.id === form.step_id);
  const editable = form.status !== TaskFormStatus.SUBMITTED && !isTerminal(task);
  return {
    id: form.id,
    step_id: form.step_id,
    title: form.title,
    status: form.status,
    sections: form.sections.map((section) => ({
      id: section.id,
      kind: section.kind,
      title: section.title,
      fields: section.fields.map((field) => ({
        id: field.id,
        label: field.label,
        description: field.description,
        control: field.control,
        width: field.width,
        required: field.required,
        locked: field.locked,
        value_source: field.value_source,
        validation: field.validation,
        options: field.options.map((option) => ({ ...option })),
        value: task.values[field.id] ?? null,
      })),
    })),
    saved_at: iso(form.saved_at),
    submitted_at: iso(form.submitted_at),
    editable,
    submittable: editable && step?.status === TaskStepStatus.AWAITING_REQUESTER,
  };
}

function serializeStep(step: TaskStepRecord, index: number): TaskStepDto {
  return {
    id: step.id,
    position: index + 1,
    kind: step.kind,
    origin: step.origin,
    name: step.name,
    description: step.description,
    status: step.status,
    outcome: step.outcome,
    is_conditional: step.condition !== null,
    form_id: step.form_id,
    assignee: step.assignee ? serializeAssignee(step.assignee) : null,
    approval: step.approval
      ? {
          decision: step.approval.decision,
          comment: step.approval.comment,
          decided_at: iso(step.approval.decided_at),
          notified_at: iso(step.approval.notified_at),
        }
      : null,
    information_request: step.information_request
      ? { requested_by_step_id: step.information_request.requested_by_step_id, question: step.information_request.question }
      : null,
    activated_at: iso(step.activated_at),
    completed_at: iso(step.completed_at),
  };
}

export function taskProgress(task: TaskDocument): TaskProgressDto {
  return {
    completed: task.steps.filter((step) => step.status === TaskStepStatus.COMPLETED).length,
    total: task.steps.filter((step) => !UNCOUNTED_STEP_STATUSES.includes(step.status)).length,
    current_step_ids: task.steps.filter((step) => ACTIVE_TASK_STEP_STATUSES.includes(step.status)).map((step) => step.id),
  };
}

export function serializeTask(task: TaskDocument, options: TaskSerializationOptions): TaskDto {
  return {
    id: String(task._id),
    reference: task.reference,
    title: task.title,
    status: task.status,
    creation_source: task.creation_source,
    workflow_template_id: task.workflow_template_id,
    workflow_template_version: task.workflow_template_version,
    requester: serializeRequesterSnapshot(task.requester),
    conversation: task.conversation.map((message) => ({ role: message.role, text: message.text, sent_at: message.sent_at.toISOString() })),
    steps: task.steps.map(serializeStep),
    forms: task.forms.map((form) => serializeForm(form, task)),
    unsupported_inputs: task.unsupported_inputs.map((input) => ({ ...input })),
    progress: taskProgress(task),
    available_actions: {
      can_cancel: !isTerminal(task),
      can_delete: options.isDeletable(task),
      can_download_transcript: task.status === TaskStatus.COMPLETED && options.documentsEnabled,
    },
    created_at: task.created_at.toISOString(),
    updated_at: task.updated_at.toISOString(),
    completed_at: iso(task.completed_at),
  };
}

export function serializeTaskSummary(task: TaskDocument): TaskSummaryDto {
  return {
    id: String(task._id),
    reference: task.reference,
    title: task.title,
    status: task.status,
    current_steps: task.steps
      .filter((step) => ACTIVE_TASK_STEP_STATUSES.includes(step.status))
      .map((step) => ({ id: step.id, name: step.name, status: step.status })),
    progress: taskProgress(task),
    created_at: task.created_at.toISOString(),
    updated_at: task.updated_at.toISOString(),
  };
}

export function serializeTaskList(page: TaskListPage<TaskDocument>, limit: number, offset: number): TaskListResponseDto {
  return { tasks: page.tasks.map(serializeTaskSummary), page: { total: page.total, limit, offset } };
}
