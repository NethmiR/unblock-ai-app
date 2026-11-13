import type {
  FormFieldBindingKind,
  FormFieldControl,
  FormFieldIssueCode,
  FormFieldValueSource,
  FormFieldWidth,
  FormSectionKind,
  TaskFormStatus,
} from "../../../data/constants/task-form.constant.js";
import type { RequesterAttribute } from "../../../data/constants/requester.constant.js";
import type { InputValidation } from "../workflow/workflow.type.js";

export type FormFieldBinding =
  | { kind: FormFieldBindingKind.INPUT; input_id: string }
  | { kind: FormFieldBindingKind.REQUESTER_ATTRIBUTE; attribute: RequesterAttribute }
  | { kind: FormFieldBindingKind.ASSIGNEE; step_id: string }
  | { kind: FormFieldBindingKind.INFORMATION_RESPONSE; step_id: string };

export interface FormFieldOption {
  value: string;
  label: string;
  description: string | null;
}

export interface TaskFormField {
  id: string;
  label: string;
  description: string | null;
  control: FormFieldControl;
  width: FormFieldWidth;
  required: boolean;
  locked: boolean;
  value_source: FormFieldValueSource;
  validation: InputValidation | null;
  options: FormFieldOption[];
  binding: FormFieldBinding;
}

export interface TaskFormSection {
  id: string;
  kind: FormSectionKind;
  title: string;
  fields: TaskFormField[];
}

export interface TaskFormRecord {
  id: string;
  step_id: string;
  title: string;
  status: TaskFormStatus;
  sections: TaskFormSection[];
  saved_at: Date | null;
  submitted_at: Date | null;
}

export interface FormFieldIssue {
  field_id: string;
  code: FormFieldIssueCode;
  limit: string | number | null;
}

export type FormValuesInput = Readonly<Record<string, unknown>>;
