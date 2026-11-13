import { FormSectionKind, TaskFormStatus } from "../../data/constants/task-form.constant.js";
import { ENTRY_FORM_STEP_ID, TaskStepKind } from "../../data/constants/task.constant.js";
import { computedLabel, computeValues } from "../workflow/computed-evaluator.util.js";
import { trustedTaskValues } from "./task-condition-namespace.util.js";
import { inputFieldId } from "./task-field-id.util.js";
import { formatFieldValue } from "./task-field-format.util.js";
import type { TaskFormSubmissionStamp } from "../../lib/types/approval/approval.type.js";
import type { DocumentField, DocumentSection } from "../../lib/types/document/document.type.js";
import type { RequesterSnapshotUnit, TaskDocument, TaskStepRecord } from "../../lib/types/task/task-document.type.js";
import type { WorkflowDefinition } from "../../lib/types/workflow/workflow.type.js";

const SECTION_TITLE_SEPARATOR = " — ";
const UNIT_SEPARATOR = ", ";

export interface InformationExchangeView {
  step: TaskStepRecord;
  askedBy: string | null;
  question: string;
  answer: string | null;
}

export function taskSubmittedAt(task: Pick<TaskDocument, "created_at"> & { forms: TaskFormSubmissionStamp[] }): Date {
  return task.forms.find((form) => form.step_id === ENTRY_FORM_STEP_ID)?.submitted_at ?? task.created_at;
}

export function submittedFormSections(task: TaskDocument): DocumentSection[] {
  return task.steps.flatMap((step) => {
    const form = task.forms.find((candidate) => candidate.step_id === step.id && candidate.status === TaskFormStatus.SUBMITTED);
    if (!form) return [];
    return form.sections
      .filter((section) => section.kind !== FormSectionKind.INFORMATION_RESPONSE && section.fields.length > 0)
      .map((section) => ({
        title: `${form.title}${SECTION_TITLE_SEPARATOR}${section.title}`,
        fields: section.fields.map((field) => ({ label: field.label, value: formatFieldValue(task.values[field.id]) })),
      }));
  });
}

export function computedFields(task: TaskDocument, definition: WorkflowDefinition): DocumentField[] {
  const trusted = trustedTaskValues(task);
  const values = computeValues(definition, (inputId) => trusted.get(inputFieldId(inputId)));
  return definition.computed.flatMap((computed) => {
    const value = values.get(computed.id) ?? null;
    return value === null ? [] : [{ label: computedLabel(computed), value: formatFieldValue(value) }];
  });
}

export function informationExchanges(task: TaskDocument): InformationExchangeView[] {
  return task.steps.flatMap((step) => {
    if (step.kind !== TaskStepKind.INFORMATION_REQUEST || step.information_request === null) return [];
    const asker = task.steps.find((candidate) => candidate.id === step.information_request?.requested_by_step_id);
    const answer = task.values[step.information_request.response_field_id];
    return [
      {
        step,
        askedBy: asker?.assignee?.full_name ?? null,
        question: step.information_request.question,
        answer: typeof answer === "string" ? answer : null,
      },
    ];
  });
}

export function describeRequesterUnit(unit: RequesterSnapshotUnit): string {
  const place = unit.parent_name ? `${unit.name} (${unit.parent_name})` : unit.name;
  return unit.designation_titles.length > 0 ? `${place}${SECTION_TITLE_SEPARATOR}${unit.designation_titles.join(UNIT_SEPARATOR)}` : place;
}
