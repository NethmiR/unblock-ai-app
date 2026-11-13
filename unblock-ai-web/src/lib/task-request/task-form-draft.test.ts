import { describe, expect, it } from "vitest";
import { buildField, buildForm } from "@/lib/testing/task-request-fixture";
import {
  TaskFormDraftActionKind,
  allRequestValues,
  changedValues,
  formBaselineKey,
  initialDraftFromForm,
  isDraftDirty,
  taskFormDraftReducer,
  toRequestValue,
} from "./task-form-draft";
import { FormFieldControl, FormFieldIssueCode } from "@/types/task-form";

const FORM = buildForm([
  buildField({ id: "requester.full_name", locked: true, value: "Kavindu" }),
  buildField({ id: "inputs.destination", value: "Tokyo" }),
  buildField({ id: "inputs.days", control: FormFieldControl.NUMBER, value: 40 }),
  buildField({ id: "inputs.funded", control: FormFieldControl.SWITCH, value: null }),
  buildField({ id: "assignees.advisor", control: FormFieldControl.PERSON, value: null }),
]);

describe("task form draft", () => {
  it("starts from the editable fields only, normalising values for controls", () => {
    const state = initialDraftFromForm(FORM);
    expect(state.values).toEqual({
      "inputs.destination": "Tokyo",
      "inputs.days": "40",
      "inputs.funded": false,
      "assignees.advisor": { name: "", email: "" },
    });
    expect(isDraftDirty(state)).toBe(false);
  });

  it("tracks changes and clears the changed field's issue", () => {
    let state = initialDraftFromForm(FORM);
    state = taskFormDraftReducer(state, {
      kind: TaskFormDraftActionKind.ISSUES_SET,
      issues: [{ field_id: "inputs.destination", code: FormFieldIssueCode.REQUIRED, limit: null }],
    });
    state = taskFormDraftReducer(state, { kind: TaskFormDraftActionKind.FIELD_CHANGED, fieldId: "inputs.destination", value: "" });
    state = taskFormDraftReducer(state, {
      kind: TaskFormDraftActionKind.FIELD_CHANGED,
      fieldId: "assignees.advisor",
      value: { name: "Nimal", email: "n@u.lk" },
    });
    expect(state.issues).toEqual({});
    expect(isDraftDirty(state)).toBe(true);
    expect(changedValues(state)).toEqual({
      "inputs.destination": null,
      "assignees.advisor": { user_id: null, name: "Nimal", email: "n@u.lk" },
    });
  });

  it("sends every editable value, keeping false as a real value", () => {
    expect(allRequestValues(initialDraftFromForm(FORM))).toEqual({
      "inputs.destination": "Tokyo",
      "inputs.days": "40",
      "inputs.funded": false,
      "assignees.advisor": null,
    });
  });

  it("resets to the saved form", () => {
    let state = initialDraftFromForm(FORM);
    state = taskFormDraftReducer(state, { kind: TaskFormDraftActionKind.FIELD_CHANGED, fieldId: "inputs.destination", value: "Paris" });
    state = taskFormDraftReducer(state, { kind: TaskFormDraftActionKind.RESET, form: FORM });
    expect(isDraftDirty(state)).toBe(false);
  });

  it("changes its baseline key only when the saved state changes", () => {
    expect(formBaselineKey(FORM)).toBe(formBaselineKey({ ...FORM, editable: false }));
    expect(formBaselineKey(FORM)).not.toBe(formBaselineKey({ ...FORM, saved_at: "2026-11-13T10:00:00.000Z" }));
  });

  it("maps blank values to null", () => {
    expect(toRequestValue("  ")).toBeNull();
    expect(toRequestValue(true)).toBe(true);
  });
});
