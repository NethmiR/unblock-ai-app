import type { InputType } from "../../lib/types/workflow/workflow.type.js";

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

export enum FormFieldBindingKind {
  INPUT = "input",
  REQUESTER_ATTRIBUTE = "requester_attribute",
  ASSIGNEE = "assignee",
  INFORMATION_RESPONSE = "information_response",
}

export enum FormSectionKind {
  REQUESTER_DETAILS = "requester_details",
  REQUEST_DETAILS = "request_details",
  APPROVER_DETAILS = "approver_details",
  INFORMATION_RESPONSE = "information_response",
}

export type CollectableInputType = Exclude<InputType, "file">;

export const UNSUPPORTED_INPUT_TYPES: readonly InputType[] = ["file"];

export const FORM_CONTROL_BY_INPUT_TYPE: Readonly<Record<CollectableInputType, FormFieldControl>> = {
  string: FormFieldControl.TEXT,
  text: FormFieldControl.TEXTAREA,
  number: FormFieldControl.NUMBER,
  date: FormFieldControl.DATE,
  datetime: FormFieldControl.DATETIME,
  boolean: FormFieldControl.SWITCH,
  email: FormFieldControl.EMAIL,
  phone: FormFieldControl.PHONE,
  enum: FormFieldControl.TEXT,
  person: FormFieldControl.PERSON,
};

export const FORM_FIELD_WIDTH_BY_CONTROL: Readonly<Record<FormFieldControl, FormFieldWidth>> = {
  [FormFieldControl.TEXT]: FormFieldWidth.HALF,
  [FormFieldControl.NUMBER]: FormFieldWidth.HALF,
  [FormFieldControl.DATE]: FormFieldWidth.HALF,
  [FormFieldControl.DATETIME]: FormFieldWidth.HALF,
  [FormFieldControl.EMAIL]: FormFieldWidth.HALF,
  [FormFieldControl.PHONE]: FormFieldWidth.HALF,
  [FormFieldControl.SWITCH]: FormFieldWidth.HALF,
  [FormFieldControl.SELECT]: FormFieldWidth.HALF,
  [FormFieldControl.TEXTAREA]: FormFieldWidth.FULL,
  [FormFieldControl.PERSON]: FormFieldWidth.FULL,
};

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

export const FORM_SECTION_TITLE: Readonly<Record<FormSectionKind, string>> = {
  [FormSectionKind.REQUESTER_DETAILS]: "Your details",
  [FormSectionKind.REQUEST_DETAILS]: "Request details",
  [FormSectionKind.APPROVER_DETAILS]: "Approver details",
  [FormSectionKind.INFORMATION_RESPONSE]: "Your answer",
};

export const APPROVER_FIELD_LABEL_SEPARATOR = " — ";
