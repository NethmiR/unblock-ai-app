import test from "node:test";
import assert from "node:assert/strict";
import { approvalRepeatStepId, formIdForStep, informationRequestStepId } from "../../../src/utils/task/task-step-id.util.js";

test("inserted step ids derive from the definition step id", () => {
  assert.equal(informationRequestStepId("hod_approval", 1), "hod_approval__information_request_1");
  assert.equal(approvalRepeatStepId("hod_approval", 2), "hod_approval__repeat_2");
});

test("form ids derive from the step id", () => {
  assert.equal(formIdForStep("entry_form"), "entry_form__form");
});
