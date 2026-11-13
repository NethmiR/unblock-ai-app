import {
  FormFieldControl,
  FormFieldValueSource,
  FormFieldWidth,
  FormSectionKind,
  TaskFormStatus,
  type TaskFormDto,
  type TaskFormFieldDto,
} from "@/types/task-form";
import { TaskStepKind, TaskStepOrigin, TaskStepStatus, type TaskStepDto } from "@/types/task";

export function buildField(overrides: Partial<TaskFormFieldDto> & Pick<TaskFormFieldDto, "id">): TaskFormFieldDto {
  return {
    label: overrides.id,
    description: null,
    control: FormFieldControl.TEXT,
    width: FormFieldWidth.HALF,
    required: false,
    locked: false,
    value_source: FormFieldValueSource.REQUESTER,
    validation: null,
    options: [],
    value: null,
    ...overrides,
  };
}

export function buildForm(fields: TaskFormFieldDto[], overrides: Partial<TaskFormDto> = {}): TaskFormDto {
  return {
    id: "entry_form__form",
    step_id: "entry_form",
    title: "Your request",
    status: TaskFormStatus.DRAFT,
    sections: [{ id: "request", kind: FormSectionKind.REQUEST_DETAILS, title: "Request details", fields }],
    saved_at: null,
    submitted_at: null,
    editable: true,
    submittable: true,
    ...overrides,
  };
}

export function buildStep(overrides: Partial<TaskStepDto> & Pick<TaskStepDto, "id">): TaskStepDto {
  return {
    position: 1,
    kind: TaskStepKind.APPROVAL,
    origin: TaskStepOrigin.WORKFLOW,
    name: overrides.id,
    description: null,
    status: TaskStepStatus.UPCOMING,
    outcome: null,
    is_conditional: false,
    form_id: null,
    assignee: null,
    approval: null,
    information_request: null,
    activated_at: null,
    completed_at: null,
    ...overrides,
  };
}
