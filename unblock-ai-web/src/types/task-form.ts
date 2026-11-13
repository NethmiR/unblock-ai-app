/**
 * TypeScript mirror of unblock-ai-api/src/lib/types/task/{task-form,task-dto}.type.ts
 * and unblock-ai-api/src/data/constants/task-form.constant.ts.
 *
 * WHEN THE SCHEMA CHANGES, CHANGE THIS FILE IN THE SAME COMMIT.
 */
import type { InputValidation } from "./workflow";

export enum TaskFormStatus {
  DRAFT = "draft",
  SUBMITTED = "submitted",
}

export enum FormValidationMode {
  DRAFT = "draft",
  SUBMIT = "submit",
}

export enum FormFieldControl {
  TEXT = "text",
  TEXTAREA = "textarea",
  NUMBER = "number",
  DATE = "date",
  DATETIME = "datetime",
  EMAIL = "email",
  PHONE = "phone",
  SWITCH = "switch",
  SELECT = "select",
  PERSON = "person",
}

export enum FormFieldWidth {
  HALF = "half",
  FULL = "full",
}

export enum FormFieldValueSource {
  REQUESTER = "requester",
  REQUESTER_PROFILE = "requester_profile",
  DIRECTORY = "directory",
}

export enum FormSectionKind {
  REQUESTER_DETAILS = "requester_details",
  REQUEST_DETAILS = "request_details",
  APPROVER_DETAILS = "approver_details",
  INFORMATION_RESPONSE = "information_response",
}

export enum FormFieldIssueCode {
  REQUIRED = "required",
  UNKNOWN_FIELD = "unknown_field",
  LOCKED = "locked",
  INVALID_TYPE = "invalid_type",
  INVALID_EMAIL = "invalid_email",
  INVALID_DATE = "invalid_date",
  INVALID_PHONE = "invalid_phone",
  TOO_SHORT = "too_short",
  TOO_LONG = "too_long",
  BELOW_MINIMUM = "below_minimum",
  ABOVE_MAXIMUM = "above_maximum",
  BEFORE_EARLIEST_DATE = "before_earliest_date",
  AFTER_LATEST_DATE = "after_latest_date",
  PATTERN_MISMATCH = "pattern_mismatch",
  NOT_AN_OPTION = "not_an_option",
}

export const FORM_VALUE_PATTERN = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  DATE: /^\d{4}-\d{2}-\d{2}$/,
  DATETIME: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
  PHONE: /^\+?[0-9][0-9 ()-]{6,19}$/,
} as const;

export const DATE_BOUND_TODAY = "today";

export enum TaskValueNamespace {
  INPUTS = "inputs",
  REQUESTER = "requester",
  ASSIGNEES = "assignees",
  RESPONSES = "responses",
}

export const FIELD_ID_SEPARATOR = ".";

export const TASK_FIELD_LIMIT = {
  TEXT_MAX_LENGTH: 5000,
  COMMENT_MAX_LENGTH: 2000,
  SEARCH_MAX_LENGTH: 200,
  LIST_DEFAULT_LIMIT: 20,
  LIST_MAX_LIMIT: 100,
} as const;

export interface PersonValueDto {
  user_id: string | null;
  name: string;
  email: string;
}

export type TaskFieldValueDto = string | number | boolean | PersonValueDto | null;

export interface FormFieldOption {
  value: string;
  label: string;
  description: string | null;
}

export interface TaskFormFieldDto {
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
  value: TaskFieldValueDto;
}

export interface TaskFormSectionDto {
  id: string;
  kind: FormSectionKind;
  title: string;
  fields: TaskFormFieldDto[];
}

export interface TaskFormDto {
  id: string;
  step_id: string;
  title: string;
  status: TaskFormStatus;
  sections: TaskFormSectionDto[];
  saved_at: string | null;
  submitted_at: string | null;
  editable: boolean;
  submittable: boolean;
}

export interface FormFieldIssueDto {
  field_id: string;
  code: FormFieldIssueCode;
  limit: string | number | null;
}

export interface TaskFormValuesRequest {
  values: Record<string, TaskFieldValueDto>;
}
