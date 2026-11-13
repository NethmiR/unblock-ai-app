import test from "node:test";
import assert from "node:assert/strict";
import {
  FormFieldBindingKind,
  FormFieldControl,
  FormFieldIssueCode,
  FormFieldValueSource,
  FormFieldWidth,
  FormValidationMode,
} from "../../../src/data/constants/task-form.constant.js";
import { TASK_FIELD_LIMIT } from "../../../src/data/constants/task.constant.js";
import { validateFormValues } from "../../../src/utils/task/task-field-validator.util.js";
import type { FormFieldIssue, TaskFormField } from "../../../src/lib/types/task/task-form.type.js";
import type { TaskFieldValue } from "../../../src/lib/types/task/task-value.type.js";
import type { InputValidation } from "../../../src/lib/types/workflow/workflow.type.js";

const TODAY = "2026-11-13";

function validation(overrides: Partial<InputValidation> = {}): InputValidation {
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

function field(id: string, control: FormFieldControl, overrides: Partial<TaskFormField> = {}): TaskFormField {
  return {
    id,
    label: id,
    description: null,
    control,
    width: FormFieldWidth.HALF,
    required: false,
    locked: false,
    value_source: FormFieldValueSource.REQUESTER,
    validation: null,
    options: [],
    binding: { kind: FormFieldBindingKind.INPUT, input_id: id },
    ...overrides,
  };
}

function run(
  fields: TaskFormField[],
  values: Record<string, unknown>,
  mode: FormValidationMode = FormValidationMode.DRAFT,
  allValues: Record<string, TaskFieldValue> = {},
): { values: Record<string, TaskFieldValue>; issues: FormFieldIssue[] } {
  return validateFormValues({ fields, values, allValues, mode, today: TODAY });
}

function codes(result: { issues: FormFieldIssue[] }): FormFieldIssueCode[] {
  return result.issues.map((issue) => issue.code);
}

test("coerces numeric strings and trims text", () => {
  const result = run(
    [field("inputs.amount", FormFieldControl.NUMBER), field("inputs.reason", FormFieldControl.TEXTAREA)],
    { "inputs.amount": "42", "inputs.reason": "  conference  " },
  );

  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.values, { "inputs.amount": 42, "inputs.reason": "conference" });
});

test("unknown and locked fields are reported and never written", () => {
  const locked = field("requester.email", FormFieldControl.EMAIL, { locked: true, value_source: FormFieldValueSource.REQUESTER_PROFILE });
  const result = run([locked], { "requester.email": "x@y.z", "inputs.nope": "a" });

  assert.deepEqual(codes(result).sort(), [FormFieldIssueCode.LOCKED, FormFieldIssueCode.UNKNOWN_FIELD].sort());
  assert.deepEqual(result.values, {});
});

test("type and format issues are reported in draft mode", () => {
  const fields = [
    field("inputs.n", FormFieldControl.NUMBER),
    field("inputs.flag", FormFieldControl.SWITCH),
    field("inputs.mail", FormFieldControl.EMAIL),
    field("inputs.day", FormFieldControl.DATE),
    field("inputs.at", FormFieldControl.DATETIME),
    field("inputs.phone", FormFieldControl.PHONE),
    field("inputs.text", FormFieldControl.TEXT),
  ];
  const result = run(fields, {
    "inputs.n": "abc",
    "inputs.flag": "true",
    "inputs.mail": "nope",
    "inputs.day": "17-08-2026",
    "inputs.at": "2026-08-17",
    "inputs.phone": "abc",
    "inputs.text": 12,
  });

  assert.deepEqual(
    Object.fromEntries(result.issues.map((issue) => [issue.field_id, issue.code])),
    {
      "inputs.n": FormFieldIssueCode.INVALID_TYPE,
      "inputs.flag": FormFieldIssueCode.INVALID_TYPE,
      "inputs.mail": FormFieldIssueCode.INVALID_EMAIL,
      "inputs.day": FormFieldIssueCode.INVALID_DATE,
      "inputs.at": FormFieldIssueCode.INVALID_DATE,
      "inputs.phone": FormFieldIssueCode.INVALID_PHONE,
      "inputs.text": FormFieldIssueCode.INVALID_TYPE,
    },
  );
});

test("length, range and pattern rules carry their limit", () => {
  const fields = [
    field("inputs.short", FormFieldControl.TEXT, { validation: validation({ min_length: 5 }) }),
    field("inputs.long", FormFieldControl.TEXT, { validation: validation({ max_length: 3 }) }),
    field("inputs.low", FormFieldControl.NUMBER, { validation: validation({ min: 10 }) }),
    field("inputs.high", FormFieldControl.NUMBER, { validation: validation({ max: 10 }) }),
    field("inputs.code", FormFieldControl.TEXT, { validation: validation({ pattern: "^[A-Z]{3}$" }) }),
  ];
  const result = run(fields, {
    "inputs.short": "abc",
    "inputs.long": "abcd",
    "inputs.low": 5,
    "inputs.high": 11,
    "inputs.code": "abc",
  });

  assert.deepEqual(
    result.issues.map((issue) => [issue.field_id, issue.code, issue.limit]),
    [
      ["inputs.short", FormFieldIssueCode.TOO_SHORT, 5],
      ["inputs.long", FormFieldIssueCode.TOO_LONG, 3],
      ["inputs.low", FormFieldIssueCode.BELOW_MINIMUM, 10],
      ["inputs.high", FormFieldIssueCode.ABOVE_MAXIMUM, 10],
      ["inputs.code", FormFieldIssueCode.PATTERN_MISMATCH, null],
    ],
  );
});

test("text is capped at the global maximum length", () => {
  const result = run([field("inputs.reason", FormFieldControl.TEXTAREA)], {
    "inputs.reason": "x".repeat(TASK_FIELD_LIMIT.TEXT_MAX_LENGTH + 1),
  });

  assert.deepEqual(codes(result), [FormFieldIssueCode.TOO_LONG]);
});

test("an invalid pattern written by the generator never throws", () => {
  const result = run([field("inputs.code", FormFieldControl.TEXT, { validation: validation({ pattern: "([" }) })], {
    "inputs.code": "abc",
  });

  assert.deepEqual(result.issues, []);
});

test("select values must be one of the options", () => {
  const options = [{ value: "user-1", label: "Jane", description: null }];
  const select = field("assignees.hod", FormFieldControl.SELECT, { options });

  assert.deepEqual(codes(run([select], { "assignees.hod": "user-2" })), [FormFieldIssueCode.NOT_AN_OPTION]);
  assert.deepEqual(run([select], { "assignees.hod": "user-1" }).values, { "assignees.hod": "user-1" });
});

test("person values need a name and a valid email", () => {
  const person = field("assignees.advisor", FormFieldControl.PERSON);

  assert.deepEqual(run([person], { "assignees.advisor": { name: "Jane", email: "jane@uni.lk" } }).values, {
    "assignees.advisor": { user_id: null, name: "Jane", email: "jane@uni.lk" },
  });
  assert.deepEqual(codes(run([person], { "assignees.advisor": { name: "Jane", email: "bad" } })), [FormFieldIssueCode.INVALID_EMAIL]);
  assert.deepEqual(codes(run([person], { "assignees.advisor": "Jane" })), [FormFieldIssueCode.INVALID_TYPE]);
});

test("required applies only in submit mode", () => {
  const required = field("inputs.reason", FormFieldControl.TEXT, { required: true });

  assert.deepEqual(run([required], { "inputs.reason": "" }).issues, []);
  assert.deepEqual(run([required], { "inputs.reason": null }).values, { "inputs.reason": null });
  assert.deepEqual(codes(run([required], {}, FormValidationMode.SUBMIT)), [FormFieldIssueCode.REQUIRED]);
});

test("submit accepts required values saved earlier and switches set to false", () => {
  const fields = [
    field("inputs.reason", FormFieldControl.TEXT, { required: true }),
    field("inputs.funded", FormFieldControl.SWITCH, { required: true }),
    field("requester.email", FormFieldControl.EMAIL, { required: true, locked: true }),
  ];

  const result = run(fields, { "inputs.funded": false }, FormValidationMode.SUBMIT, { "inputs.reason": "conference" });

  assert.deepEqual(result.issues, []);
});

test("date bounds resolve today, absolute dates and other fields", () => {
  const fields = [
    field("inputs.departure_date", FormFieldControl.DATE, { validation: validation({ not_before: "today" }) }),
    field("inputs.return_date", FormFieldControl.DATE, {
      validation: validation({ not_before_field: "inputs.departure_date", not_after: "2027-12-31" }),
    }),
  ];

  const past = run(fields, { "inputs.departure_date": "2026-11-01" });
  assert.deepEqual(past.issues, [
    { field_id: "inputs.departure_date", code: FormFieldIssueCode.BEFORE_EARLIEST_DATE, limit: TODAY },
  ]);

  const together = run(fields, { "inputs.departure_date": "2026-12-10", "inputs.return_date": "2026-12-01" });
  assert.deepEqual(together.issues, [
    { field_id: "inputs.return_date", code: FormFieldIssueCode.BEFORE_EARLIEST_DATE, limit: "2026-12-10" },
  ]);

  const late = run(fields, { "inputs.return_date": "2028-01-05" });
  assert.deepEqual(codes(late), [FormFieldIssueCode.AFTER_LATEST_DATE]);
});

test("cross-field bounds read values saved earlier in submit mode", () => {
  const fields = [
    field("inputs.return_date", FormFieldControl.DATE, {
      required: true,
      validation: validation({ not_after_field: "inputs.deadline" }),
    }),
  ];

  const result = run(fields, {}, FormValidationMode.SUBMIT, { "inputs.return_date": "2026-12-20", "inputs.deadline": "2026-12-15" });

  assert.deepEqual(result.issues, [
    { field_id: "inputs.return_date", code: FormFieldIssueCode.AFTER_LATEST_DATE, limit: "2026-12-15" },
  ]);
});

test("legacy bare input bounds still resolve", () => {
  const fields = [
    field("inputs.return_date", FormFieldControl.DATE, { validation: validation({ not_before_field: "departure_date" }) }),
  ];

  const result = run(fields, { "inputs.return_date": "2026-12-01" }, FormValidationMode.DRAFT, {
    "inputs.departure_date": "2026-12-05",
  });

  assert.deepEqual(codes(result), [FormFieldIssueCode.BEFORE_EARLIEST_DATE]);
});
