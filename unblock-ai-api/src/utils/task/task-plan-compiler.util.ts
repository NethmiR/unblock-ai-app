import { AssigneeSource } from "../../data/constants/assignee.constant.js";
import {
  REQUESTER_ATTRIBUTE_LABEL,
  REQUESTER_DETAILS_ATTRIBUTES,
  RequesterAttribute,
} from "../../data/constants/requester.constant.js";
import {
  APPROVER_FIELD_LABEL_SEPARATOR,
  FORM_FIELD_WIDTH_BY_CONTROL,
  FORM_SECTION_TITLE,
  FormFieldBindingKind,
  FormFieldControl,
  FormFieldValueSource,
  FormSectionKind,
  TaskFormStatus,
  UNSUPPORTED_INPUT_TYPES,
} from "../../data/constants/task-form.constant.js";
import {
  ENTRY_FORM_STEP_ID,
  ENTRY_FORM_STEP_NAME,
  TASK_STEP_KIND_BY_WORKFLOW_STEP_TYPE,
  TERMINATING_OUTCOME_ACTION,
  TaskStepKind,
  TaskStepOrigin,
  TaskStepOutcome,
  TaskStepStatus,
} from "../../data/constants/task.constant.js";
import { topologicalStepOrder } from "../workflow/graph-validator.util.js";
import { matchRequesterAttribute } from "../requester/requester-attribute-input.util.js";
import { requesterAttributeValues } from "../requester/requester-attribute.util.js";
import { titleCaseIdentifier } from "../shared/text.util.js";
import { fieldLayoutForInput } from "./task-form-layout.util.js";
import { inputFieldId, requesterFieldId } from "./task-field-id.util.js";
import { formIdForStep } from "./task-step-id.util.js";
import type { AssigneeResolution } from "../../lib/types/assignee/assignee-resolver.type.js";
import type { TaskAssignee, TaskStepDependency, TaskStepRecord, UnsupportedTaskInput } from "../../lib/types/task/task-document.type.js";
import type { TaskFormField, TaskFormRecord, TaskFormSection } from "../../lib/types/task/task-form.type.js";
import type { CompiledTaskPlan, TaskPlanInput } from "../../lib/types/task/task-plan.type.js";
import type { TaskFieldValue } from "../../lib/types/task/task-value.type.js";
import type { RequesterAttributeValues, RequesterProfile } from "../../lib/types/requester/requester.type.js";
import type { StepDependency, WorkflowStep } from "../../lib/types/workflow/step.type.js";
import type { WorkflowDefinition, WorkflowInput } from "../../lib/types/workflow/workflow.type.js";

const REQUESTER_RESOLUTION = "requester";
const TASK_STEP_OUTCOMES: readonly string[] = Object.values(TaskStepOutcome);

interface InputPartition {
  unsupported: UnsupportedTaskInput[];
  lockedAttributes: Map<string, RequesterAttribute>;
  byStep: Map<string, WorkflowInput[]>;
  entry: WorkflowInput[];
}

function isTaskStepOutcome(value: string): value is TaskStepOutcome {
  return TASK_STEP_OUTCOMES.includes(value);
}

function partitionInputs(definition: WorkflowDefinition, attributes: RequesterAttributeValues): InputPartition {
  const collectingStep = new Map<string, string>();
  for (const step of definition.steps) for (const inputId of step.collects_inputs) collectingStep.set(inputId, step.id);

  const partition: InputPartition = { unsupported: [], lockedAttributes: new Map(), byStep: new Map(), entry: [] };
  for (const input of definition.inputs) {
    if (input.collected_from.resolution !== REQUESTER_RESOLUTION) continue;
    if (UNSUPPORTED_INPUT_TYPES.includes(input.type)) {
      partition.unsupported.push({ input_id: input.id, label: input.label });
      continue;
    }
    const attribute = matchRequesterAttribute(input);
    if (attribute !== null && attributes[attribute] !== null) {
      partition.lockedAttributes.set(input.id, attribute);
      continue;
    }
    const stepId = collectingStep.get(input.id);
    if (stepId === undefined) partition.entry.push(input);
    else partition.byStep.set(stepId, [...(partition.byStep.get(stepId) ?? []), input]);
  }
  return partition;
}

function inputField(input: WorkflowInput): TaskFormField | null {
  const layout = fieldLayoutForInput(input);
  if (layout === null) return null;
  return {
    id: inputFieldId(input.id),
    label: input.label,
    description: input.description ?? input.collection_hint,
    control: layout.control,
    width: layout.width,
    required: input.required,
    locked: false,
    value_source: FormFieldValueSource.REQUESTER,
    validation: input.validation,
    options: [],
    binding: { kind: FormFieldBindingKind.INPUT, input_id: input.id },
  };
}

function requesterField(attribute: RequesterAttribute): TaskFormField {
  const control = attribute === RequesterAttribute.EMAIL ? FormFieldControl.EMAIL : FormFieldControl.TEXT;
  return {
    id: requesterFieldId(attribute),
    label: REQUESTER_ATTRIBUTE_LABEL[attribute],
    description: null,
    control,
    width: FORM_FIELD_WIDTH_BY_CONTROL[control],
    required: false,
    locked: true,
    value_source: FormFieldValueSource.REQUESTER_PROFILE,
    validation: null,
    options: [],
    binding: { kind: FormFieldBindingKind.REQUESTER_ATTRIBUTE, attribute },
  };
}

function approverRoleLabel(assignee: TaskAssignee, step: WorkflowStep): string {
  if (assignee.designation_title) return assignee.designation_title;
  if (step.assignee.role) return titleCaseIdentifier(step.assignee.role);
  return step.assignee.display_name ?? step.name;
}

function approverField(resolution: AssigneeResolution, step: WorkflowStep): TaskFormField | null {
  const { assignee } = resolution;
  if (assignee.field_id === null) return null;
  const control = assignee.source === AssigneeSource.REQUESTER_CHOICE ? FormFieldControl.SELECT : FormFieldControl.PERSON;
  if (assignee.source !== AssigneeSource.REQUESTER_CHOICE && assignee.source !== AssigneeSource.REQUESTER_SUPPLIED) return null;
  return {
    id: assignee.field_id,
    label: `${approverRoleLabel(assignee, step)}${APPROVER_FIELD_LABEL_SEPARATOR}${step.name}`,
    description: null,
    control,
    width: FORM_FIELD_WIDTH_BY_CONTROL[control],
    required: true,
    locked: false,
    value_source: FormFieldValueSource.REQUESTER,
    validation: null,
    options: resolution.options.map((option) => ({ ...option })),
    binding: { kind: FormFieldBindingKind.ASSIGNEE, step_id: step.id },
  };
}

function section(formId: string, kind: FormSectionKind, fields: TaskFormField[]): TaskFormSection[] {
  return fields.length === 0 ? [] : [{ id: `${formId}.${kind}`, kind, title: FORM_SECTION_TITLE[kind], fields }];
}

function form(stepId: string, title: string, sections: TaskFormSection[]): TaskFormRecord {
  return { id: formIdForStep(stepId), step_id: stepId, title, status: TaskFormStatus.DRAFT, sections, saved_at: null, submitted_at: null };
}

function requesterAssignee(profile: RequesterProfile): TaskAssignee {
  return {
    source: AssigneeSource.REQUESTER,
    user_id: profile.userId,
    full_name: profile.fullName,
    email: profile.email,
    designation_title: null,
    organisational_unit_name: null,
    field_id: null,
    note: null,
    candidates: [],
  };
}

function baseStep(id: string, kind: TaskStepKind, origin: TaskStepOrigin, name: string): TaskStepRecord {
  return {
    id,
    definition_step_id: null,
    kind,
    origin,
    name,
    description: null,
    instructions_to_approver: null,
    depends_on: [],
    condition: null,
    status: TaskStepStatus.UPCOMING,
    outcome: null,
    form_id: null,
    assignee: null,
    approval: null,
    information_request: null,
    activated_at: null,
    completed_at: null,
  };
}

function mapDependency(dependency: StepDependency, kindById: ReadonlyMap<string, TaskStepKind>): TaskStepDependency {
  if (kindById.get(dependency.step_id) !== TaskStepKind.APPROVAL) {
    return { step_id: dependency.step_id, required_outcome: TaskStepOutcome.COMPLETED };
  }
  return {
    step_id: dependency.step_id,
    required_outcome: isTaskStepOutcome(dependency.required_outcome) ? dependency.required_outcome : TaskStepOutcome.APPROVED,
  };
}

function workflowStep(
  step: WorkflowStep,
  kindById: ReadonlyMap<string, TaskStepKind>,
  resolution: AssigneeResolution | undefined,
): TaskStepRecord {
  const kind = TASK_STEP_KIND_BY_WORKFLOW_STEP_TYPE[step.type];
  return {
    ...baseStep(step.id, kind, TaskStepOrigin.WORKFLOW, step.name),
    definition_step_id: step.id,
    description: step.description,
    instructions_to_approver: step.instructions_to_approver,
    depends_on: step.depends_on.map((dependency) => mapDependency(dependency, kindById)),
    condition: step.condition,
    form_id: kind === TaskStepKind.FORM ? formIdForStep(step.id) : null,
    assignee: resolution ? { ...resolution.assignee, candidates: [...resolution.assignee.candidates] } : null,
    approval:
      kind === TaskStepKind.APPROVAL
        ? {
            token_hash: null,
            token_expires_at: null,
            notified_at: null,
            decision: null,
            comment: null,
            decided_at: null,
            allows_information_request: step.outcomes.request_more_info !== null,
            terminates_on_rejection: step.outcomes.rejected?.action === TERMINATING_OUTCOME_ACTION,
          }
        : null,
  };
}

export function compileTaskPlan({ definition, profile, resolutions }: TaskPlanInput): CompiledTaskPlan {
  const attributes = requesterAttributeValues(profile);
  const partition = partitionInputs(definition, attributes);
  const resolutionByStep = new Map(resolutions.map((resolution) => [resolution.step_id, resolution]));
  const ordered = topologicalStepOrder(definition);
  const kindById = new Map(ordered.map((step) => [step.id, TASK_STEP_KIND_BY_WORKFLOW_STEP_TYPE[step.type]]));

  const detailAttributes = [
    ...new Set([...REQUESTER_DETAILS_ATTRIBUTES, ...partition.lockedAttributes.values()]),
  ].filter((attribute) => attributes[attribute] !== null);
  const requesterFields = detailAttributes.map(requesterField);
  const entryRequestFields = partition.entry.flatMap((input) => inputField(input) ?? []);
  const approverFields = ordered.flatMap((step) => {
    const resolution = resolutionByStep.get(step.id);
    return resolution ? approverField(resolution, step) ?? [] : [];
  });
  const hasEntryForm = entryRequestFields.length + approverFields.length > 0;

  const workflowSteps = ordered.map((step) => workflowStep(step, kindById, resolutionByStep.get(step.id)));
  const steps: TaskStepRecord[] = [];
  const forms: TaskFormRecord[] = [];

  if (hasEntryForm) {
    const entryFormId = formIdForStep(ENTRY_FORM_STEP_ID);
    steps.push({
      ...baseStep(ENTRY_FORM_STEP_ID, TaskStepKind.FORM, TaskStepOrigin.ENTRY_FORM, ENTRY_FORM_STEP_NAME),
      form_id: entryFormId,
      assignee: requesterAssignee(profile),
    });
    forms.push(
      form(ENTRY_FORM_STEP_ID, ENTRY_FORM_STEP_NAME, [
        ...section(entryFormId, FormSectionKind.REQUESTER_DETAILS, requesterFields),
        ...section(entryFormId, FormSectionKind.REQUEST_DETAILS, entryRequestFields),
        ...section(entryFormId, FormSectionKind.APPROVER_DETAILS, approverFields),
      ]),
    );
    for (const step of workflowSteps) {
      if (step.depends_on.length === 0) step.depends_on = [{ step_id: ENTRY_FORM_STEP_ID, required_outcome: TaskStepOutcome.COMPLETED }];
    }
  }

  let detailsPlaced = hasEntryForm;
  for (const step of workflowSteps) {
    steps.push(step);
    if (step.kind !== TaskStepKind.FORM) continue;
    const formId = formIdForStep(step.id);
    const stepFields = (partition.byStep.get(step.id) ?? []).flatMap((input) => inputField(input) ?? []);
    const details = detailsPlaced ? [] : requesterFields;
    detailsPlaced = true;
    forms.push(
      form(step.id, step.name, [
        ...section(formId, FormSectionKind.REQUESTER_DETAILS, details),
        ...section(formId, FormSectionKind.REQUEST_DETAILS, stepFields),
      ]),
    );
  }

  const values: Record<string, TaskFieldValue> = {};
  for (const attribute of detailAttributes) values[requesterFieldId(attribute)] = attributes[attribute];
  for (const [inputId, attribute] of partition.lockedAttributes) values[inputFieldId(inputId)] = attributes[attribute];

  return { steps, forms, values, unsupported_inputs: partition.unsupported };
}
