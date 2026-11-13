import test from "node:test";
import assert from "node:assert/strict";
import { FormFieldControl, FormFieldWidth } from "../../../src/data/constants/task-form.constant.js";
import { fieldLayoutForInput } from "../../../src/utils/task/task-form-layout.util.js";
import type { InputType, WorkflowInput } from "../../../src/lib/types/workflow/workflow.type.js";

function input(type: InputType): WorkflowInput {
  return {
    id: "field",
    label: "Field",
    description: null,
    type,
    collected_from: { resolution: "requester", role: null, relative_to: null, directory_query: null, fallback_role: null, display_name: null },
    required: true,
    validation: {
      min_length: null,
      max_length: null,
      min: null,
      max: null,
      not_before: null,
      not_after: null,
      not_before_field: null,
      not_after_field: null,
      pattern: null,
    },
    collection_hint: null,
  };
}

test("text areas and people span the full width; other controls take half", () => {
  assert.deepEqual(fieldLayoutForInput(input("text")), { control: FormFieldControl.TEXTAREA, width: FormFieldWidth.FULL });
  assert.deepEqual(fieldLayoutForInput(input("person")), { control: FormFieldControl.PERSON, width: FormFieldWidth.FULL });
  assert.deepEqual(fieldLayoutForInput(input("date")), { control: FormFieldControl.DATE, width: FormFieldWidth.HALF });
  assert.deepEqual(fieldLayoutForInput(input("boolean")), { control: FormFieldControl.SWITCH, width: FormFieldWidth.HALF });
});

test("enum inputs render as text and files are unsupported", () => {
  assert.deepEqual(fieldLayoutForInput(input("enum")), { control: FormFieldControl.TEXT, width: FormFieldWidth.HALF });
  assert.equal(fieldLayoutForInput(input("file")), null);
});
