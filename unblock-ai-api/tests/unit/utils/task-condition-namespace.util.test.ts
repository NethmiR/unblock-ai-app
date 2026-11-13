import test from "node:test";
import assert from "node:assert/strict";
import { buildConditionNamespace } from "../../../src/utils/task/task-condition-namespace.util.js";
import { TaskFormStatus } from "../../../src/data/constants/task-form.constant.js";
import { TaskStepOutcome } from "../../../src/data/constants/task.constant.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import { buildTaskDocument, leaveResolutions, TASK_NOW } from "../../helpers/task-fixture.helper.js";

const LEAVE = loadExpectedFixture("it_faculty_overseas_leave.json");

test("draft values are ignored and submitted values feed computed values", () => {
  const task = buildTaskDocument(LEAVE, leaveResolutions());
  const withDraft = { ...task, values: { ...task.values, "inputs.departure_date": "2026-12-01", "inputs.return_date": "2026-12-10" } };

  const draft = buildConditionNamespace(withDraft, LEAVE, TASK_NOW);
  assert.equal(draft.get("inputs.departure_date"), undefined);
  assert.equal(draft.get("computed.trip_duration_days"), undefined);
  assert.equal(draft.get("requester.email"), "u17@u.c");
  assert.equal(draft.get("system.today"), "2026-11-13");

  const submitted = { ...withDraft, forms: withDraft.forms.map((form) => ({ ...form, status: TaskFormStatus.SUBMITTED })) };
  const namespace = buildConditionNamespace(submitted, LEAVE, TASK_NOW);
  assert.equal(namespace.get("inputs.departure_date"), "2026-12-01");
  assert.equal(namespace.get("computed.trip_duration_days"), 10);
});

test("step outcomes come from the latest instance", () => {
  const task = buildTaskDocument(LEAVE, leaveResolutions());
  const decided = {
    ...task,
    steps: task.steps.map((step) => (step.id === "advisor_review" ? { ...step, outcome: TaskStepOutcome.APPROVED } : step)),
  };

  assert.equal(buildConditionNamespace(decided, LEAVE, TASK_NOW).get("steps.advisor_review.outcome"), TaskStepOutcome.APPROVED);
});
