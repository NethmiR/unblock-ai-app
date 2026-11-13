import test from "node:test";
import assert from "node:assert/strict";
import { applyAssigneeFieldValues } from "../../../src/utils/task/task-assignee-binding.util.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import { buildTaskDocument, choiceResolution, directoryResolution, suppliedResolution } from "../../helpers/task-fixture.helper.js";

const LEAVE = loadExpectedFixture("it_faculty_overseas_leave.json");

test("a person value and a chosen holder are written onto their steps", () => {
  const task = buildTaskDocument(LEAVE, [
    suppliedResolution("advisor_review"),
    choiceResolution("hod_review"),
    directoryResolution("dean_review", "Sunethra Ratnayake", "u18@u.c", "Dean"),
  ]);
  const filled = {
    ...task,
    values: {
      ...task.values,
      "assignees.advisor_review": { user_id: null, name: "Dr Advisor", email: "advisor@u.c" },
      "assignees.hod_review": "user-it",
    },
  };
  const entryForm = filled.forms.find((form) => form.id === "entry_form__form")!;

  const bound = applyAssigneeFieldValues(filled, entryForm);

  const advisor = bound.steps.find((step) => step.id === "advisor_review")?.assignee;
  const hod = bound.steps.find((step) => step.id === "hod_review")?.assignee;
  assert.deepEqual([advisor?.full_name, advisor?.email, advisor?.user_id], ["Dr Advisor", "advisor@u.c", null]);
  assert.deepEqual([hod?.full_name, hod?.email, hod?.user_id], ["Dinesh Wijesinghe", "u19@u.c", "user-it"]);
});

test("an unknown holder id leaves the assignee unbound", () => {
  const task = buildTaskDocument(LEAVE, [choiceResolution("hod_review")]);
  const filled = { ...task, values: { ...task.values, "assignees.hod_review": "someone-else" } };

  const bound = applyAssigneeFieldValues(filled, filled.forms[0]!);

  assert.equal(bound.steps.find((step) => step.id === "hod_review")?.assignee?.email, null);
});
