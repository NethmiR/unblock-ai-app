import { AssigneeSource } from "../../data/constants/assignee.constant.js";
import {
  FORM_FIELD_WIDTH_BY_CONTROL,
  FORM_SECTION_TITLE,
  FormFieldBindingKind,
  FormFieldControl,
  FormFieldValueSource,
  FormSectionKind,
  TaskFormStatus,
} from "../../data/constants/task-form.constant.js";
import {
  INFORMATION_REQUEST_STEP_NAME,
  TaskStepKind,
  TaskStepOrigin,
  TaskStepOutcome,
  TaskStepStatus,
} from "../../data/constants/task.constant.js";
import { informationResponseFieldId } from "./task-field-id.util.js";
import { approvalRepeatStepId, formIdForStep, informationRequestStepId } from "./task-step-id.util.js";
import type { TaskDocument, TaskStepRecord } from "../../lib/types/task/task-document.type.js";
import type { TaskFormRecord } from "../../lib/types/task/task-form.type.js";

export function definitionStepIdOf(step: TaskStepRecord): string {
  return step.definition_step_id ?? step.id;
}

export function informationRequestCount(task: TaskDocument, definitionStepId: string): number {
  return task.steps.filter((step) => step.kind === TaskStepKind.INFORMATION_REQUEST && step.definition_step_id === definitionStepId).length;
}

function responseForm(stepId: string, question: string): TaskFormRecord {
  const formId = formIdForStep(stepId);
  const fieldId = informationResponseFieldId(stepId);
  return {
    id: formId,
    step_id: stepId,
    title: INFORMATION_REQUEST_STEP_NAME,
    status: TaskFormStatus.DRAFT,
    sections: [
      {
        id: `${formId}.${FormSectionKind.INFORMATION_RESPONSE}`,
        kind: FormSectionKind.INFORMATION_RESPONSE,
        title: FORM_SECTION_TITLE[FormSectionKind.INFORMATION_RESPONSE],
        fields: [
          {
            id: fieldId,
            label: question,
            description: null,
            control: FormFieldControl.TEXTAREA,
            width: FORM_FIELD_WIDTH_BY_CONTROL[FormFieldControl.TEXTAREA],
            required: true,
            locked: false,
            value_source: FormFieldValueSource.REQUESTER,
            validation: null,
            options: [],
            binding: { kind: FormFieldBindingKind.INFORMATION_RESPONSE, step_id: stepId },
          },
        ],
      },
    ],
    saved_at: null,
    submitted_at: null,
  };
}

export function insertInformationRequest(task: TaskDocument, approvalStepId: string, question: string, _now: Date): TaskDocument {
  const index = task.steps.findIndex((step) => step.id === approvalStepId);
  const approval = task.steps[index];
  if (approval === undefined || approval.approval === null) return task;

  const definitionStepId = definitionStepIdOf(approval);
  const sequence = informationRequestCount(task, definitionStepId) + 1;
  const requestId = informationRequestStepId(definitionStepId, sequence);
  const repeatId = approvalRepeatStepId(definitionStepId, sequence);

  const informationRequest: TaskStepRecord = {
    id: requestId,
    definition_step_id: definitionStepId,
    kind: TaskStepKind.INFORMATION_REQUEST,
    origin: TaskStepOrigin.INFORMATION_REQUEST,
    name: INFORMATION_REQUEST_STEP_NAME,
    description: null,
    instructions_to_approver: null,
    depends_on: [{ step_id: approvalStepId, required_outcome: TaskStepOutcome.REQUEST_MORE_INFO }],
    condition: null,
    status: TaskStepStatus.UPCOMING,
    outcome: null,
    form_id: formIdForStep(requestId),
    assignee: {
      source: AssigneeSource.REQUESTER,
      user_id: task.requester.user_id,
      full_name: task.requester.full_name,
      email: task.requester.email,
      designation_title: null,
      organisational_unit_name: null,
      field_id: null,
      note: null,
      candidates: [],
    },
    approval: null,
    information_request: {
      requested_by_step_id: approvalStepId,
      question,
      response_field_id: informationResponseFieldId(requestId),
    },
    activated_at: null,
    completed_at: null,
  };

  const repeat: TaskStepRecord = {
    ...approval,
    id: repeatId,
    origin: TaskStepOrigin.APPROVAL_REPEAT,
    depends_on: [{ step_id: requestId, required_outcome: TaskStepOutcome.COMPLETED }],
    condition: null,
    status: TaskStepStatus.UPCOMING,
    outcome: null,
    assignee: approval.assignee ? { ...approval.assignee, candidates: [...approval.assignee.candidates] } : null,
    approval: {
      ...approval.approval,
      token_hash: null,
      token_expires_at: null,
      notified_at: null,
      decision: null,
      comment: null,
      decided_at: null,
      decided_via: null,
      decided_by_user_id: null,
    },
    information_request: null,
    activated_at: null,
    completed_at: null,
  };

  const rewired = task.steps.map((step) =>
    step.id === approvalStepId
      ? step
      : {
          ...step,
          depends_on: step.depends_on.map((dependency) =>
            dependency.step_id === approvalStepId ? { ...dependency, step_id: repeatId } : dependency,
          ),
        },
  );

  return {
    ...task,
    steps: [...rewired.slice(0, index + 1), informationRequest, repeat, ...rewired.slice(index + 1)],
    forms: [...task.forms, responseForm(requestId, question)],
  };
}
