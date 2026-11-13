import { describe, expect, it } from "vitest";
import { buildField, buildForm } from "@/lib/testing/task-request-fixture";
import { isEmptyFieldValue, taskFieldValues, todayIsoDate, validateFormDraft } from "./task-field-validation";
import { FormFieldControl, FormFieldIssueCode, FormValidationMode, type TaskFieldValueDto, type TaskFormFieldDto } from "@/types/task-form";
import type { InputValidation } from "@/types/workflow";

const TODAY = "2026-11-13";

function validation(overrides: Partial<InputValidation>): InputValidation {
  return {
    min_length: null,
    max_length: null,
    min: null,
    max: null,
    not_before: null,
    not_after: null,
    not_before_field: null,
    not_after_field: null,
    pattern: null,
    ...overrides,
  };
}

function codes(
  fields: TaskFormFieldDto[],
  values: Record<string, TaskFieldValueDto>,
  mode: FormValidationMode = FormValidationMode.SUBMIT,
  allValues: Record<string, TaskFieldValueDto> = {},
): string[] {
  return validateFormDraft({ fields, values, allValues, mode, today: TODAY }).map((issue) => `${issue.field_id}:${issue.code}`);
}

describe("validateFormDraft", () => {
  it.each([
    [FormFieldControl.EMAIL, "not-an-email", FormFieldIssueCode.INVALID_EMAIL],
    [FormFieldControl.PHONE, "12", FormFieldIssueCode.INVALID_PHONE],
    [FormFieldControl.DATE, "13/11/2026", FormFieldIssueCode.INVALID_DATE],
    [FormFieldControl.DATETIME, "2026-11-13", FormFieldIssueCode.INVALID_DATE],
    [FormFieldControl.NUMBER, "abc", FormFieldIssueCode.INVALID_TYPE],
    [FormFieldControl.SWITCH, "yes", FormFieldIssueCode.INVALID_TYPE],
    [FormFieldControl.TEXT, 5, FormFieldIssueCode.INVALID_TYPE],
  ])("flags a malformed %s value", (control, value, code) => {
    expect(codes([buildField({ id: "inputs.x", control })], { "inputs.x": value })).toEqual([`inputs.x:${code}`]);
  });

  it("accepts numeric strings and well-formed values", () => {
    const fields = [
      buildField({ id: "inputs.n", control: FormFieldControl.NUMBER }),
      buildField({ id: "inputs.e", control: FormFieldControl.EMAIL }),
      buildField({ id: "inputs.p", control: FormFieldControl.PHONE }),
      buildField({ id: "inputs.s", control: FormFieldControl.SWITCH }),
    ];
    expect(codes(fields, { "inputs.n": " 40 ", "inputs.e": "a@b.lk", "inputs.p": "+94 77 123 4567", "inputs.s": false })).toEqual([]);
  });

  it("applies required only in submit mode", () => {
    const fields = [buildField({ id: "inputs.reason", required: true })];
    expect(codes(fields, { "inputs.reason": "" })).toEqual(["inputs.reason:required"]);
    expect(codes(fields, { "inputs.reason": "" }, FormValidationMode.DRAFT)).toEqual([]);
  });

  it("rejects unknown and locked fields", () => {
    const fields = [buildField({ id: "requester.email", locked: true })];
    expect(codes(fields, { "requester.email": "x@y.lk", "inputs.extra": "a" })).toEqual([
      "requester.email:locked",
      "inputs.extra:unknown_field",
    ]);
  });

  it("checks length, range and pattern rules with limits", () => {
    const fields = [
      buildField({ id: "inputs.a", validation: validation({ min_length: 3 }) }),
      buildField({ id: "inputs.b", validation: validation({ max_length: 2 }) }),
      buildField({ id: "inputs.c", control: FormFieldControl.NUMBER, validation: validation({ min: 1 }) }),
      buildField({ id: "inputs.d", control: FormFieldControl.NUMBER, validation: validation({ max: 10 }) }),
      buildField({ id: "inputs.e", validation: validation({ pattern: "^[A-Z]+$" }) }),
    ];
    const issues = validateFormDraft({
      fields,
      values: { "inputs.a": "ab", "inputs.b": "abc", "inputs.c": 0, "inputs.d": 11, "inputs.e": "abc" },
      allValues: {},
      mode: FormValidationMode.DRAFT,
      today: TODAY,
    });
    expect(issues).toEqual([
      { field_id: "inputs.a", code: FormFieldIssueCode.TOO_SHORT, limit: 3 },
      { field_id: "inputs.b", code: FormFieldIssueCode.TOO_LONG, limit: 2 },
      { field_id: "inputs.c", code: FormFieldIssueCode.BELOW_MINIMUM, limit: 1 },
      { field_id: "inputs.d", code: FormFieldIssueCode.ABOVE_MAXIMUM, limit: 10 },
      { field_id: "inputs.e", code: FormFieldIssueCode.PATTERN_MISMATCH, limit: null },
    ]);
  });

  it("checks select options and person values", () => {
    const fields = [
      buildField({ id: "assignees.hod", control: FormFieldControl.SELECT, options: [{ value: "u1", label: "A", description: null }] }),
      buildField({ id: "assignees.advisor", control: FormFieldControl.PERSON }),
    ];
    expect(codes(fields, { "assignees.hod": "u2", "assignees.advisor": { user_id: null, name: "Nimal", email: "bad" } })).toEqual([
      "assignees.hod:not_an_option",
      "assignees.advisor:invalid_email",
    ]);
  });

  it("resolves today, absolute and cross-field date bounds", () => {
    const fields = [
      buildField({ id: "inputs.departure_date", control: FormFieldControl.DATE, validation: validation({ not_before: "today" }) }),
      buildField({
        id: "inputs.return_date",
        control: FormFieldControl.DATE,
        validation: validation({ not_before_field: "departure_date", not_after: "2027-01-01" }),
      }),
    ];
    expect(
      validateFormDraft({
        fields,
        values: { "inputs.departure_date": "2026-11-01", "inputs.return_date": "2026-10-01" },
        allValues: {},
        mode: FormValidationMode.SUBMIT,
        today: TODAY,
      }),
    ).toEqual([
      { field_id: "inputs.departure_date", code: FormFieldIssueCode.BEFORE_EARLIEST_DATE, limit: TODAY },
      { field_id: "inputs.return_date", code: FormFieldIssueCode.BEFORE_EARLIEST_DATE, limit: "2026-11-01" },
    ]);
    expect(codes(fields.slice(1), { "inputs.return_date": "2027-02-01" }, FormValidationMode.SUBMIT, { "inputs.departure_date": "2026-12-01" })).toEqual([
      "inputs.return_date:after_latest_date",
    ]);
  });

  it("skips rule checks on unchanged values in draft mode", () => {
    const fields = [buildField({ id: "inputs.a", validation: validation({ min_length: 5 }) })];
    expect(codes(fields, {}, FormValidationMode.DRAFT, { "inputs.a": "ab" })).toEqual([]);
    expect(codes(fields, {}, FormValidationMode.SUBMIT, { "inputs.a": "ab" })).toEqual(["inputs.a:too_short"]);
  });
});

describe("helpers", () => {
  it("treats blank strings and blank people as empty, but not false", () => {
    expect(isEmptyFieldValue("  ")).toBe(true);
    expect(isEmptyFieldValue({ user_id: null, name: " ", email: "" })).toBe(true);
    expect(isEmptyFieldValue(false)).toBe(false);
  });

  it("collects field values across every form", () => {
    const forms = [buildForm([buildField({ id: "inputs.a", value: "x" })]), buildForm([buildField({ id: "inputs.b", value: 3 })], { id: "f2" })];
    expect(taskFieldValues(forms)).toEqual({ "inputs.a": "x", "inputs.b": 3 });
  });

  it("formats today as a local ISO date", () => {
    expect(todayIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
