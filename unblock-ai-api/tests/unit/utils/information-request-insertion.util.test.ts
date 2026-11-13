import test from "node:test";
import assert from "node:assert/strict";
import { insertInformationRequest } from "../../../src/utils/task/information-request-insertion.util.js";
import { FormFieldBindingKind, FormFieldControl, FormSectionKind } from "../../../src/data/constants/task-form.constant.js";
import { TaskStepKind, TaskStepOrigin, TaskStepOutcome } from "../../../src/data/constants/task.constant.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import { buildTaskDocument, directoryResolution, TASK_NOW } from "../../helpers/task-fixture.helper.js";
import type { WorkflowDefinition } from "../../../src/lib/types/workflow/workflow.type.js";

const LEAVE = loadExpectedFixture("it_faculty_overseas_leave.json");

function twoDependants(): WorkflowDefinition {
  const advisor = LEAVE.steps[0]!;
  return {
    ...LEAVE,
    computed: [],
    steps: [
      { ...advisor, depends_on: [] },
      { ...LEAVE.steps[1]!, id: "hod_review", depends_on: [{ step_id: advisor.id, required_outcome: "approved" }] },
      { ...LEAVE.steps[1]!, id: "finance_review", condition: null, depends_on: [{ step_id: advisor.id, required_outcome: "approved" }] },
    ],
    completion: { ...LEAVE.completion, required_steps: ["hod_review", "finance_review"] },
  };
}

test("an information request and a repeat approval are spliced after the approval and dependants are rewired", () => {
  const definition = twoDependants();
  const task = buildTaskDocument(definition, definition.steps.map((step) => directoryResolution(step.id, step.id, `${step.id}@u.c`, "Dean")));

  const inserted = insertInformationRequest(task, "advisor_review", "Which conference?", TASK_NOW);

  const ids = inserted.steps.map((step) => step.id);
  const at = ids.indexOf("advisor_review");
  assert.deepEqual(ids.slice(at, at + 3), ["advisor_review", "advisor_review__information_request_1", "advisor_review__repeat_1"]);

  const request = inserted.steps[at + 1]!;
  assert.equal(request.kind, TaskStepKind.INFORMATION_REQUEST);
  assert.deepEqual(request.depends_on, [{ step_id: "advisor_review", required_outcome: TaskStepOutcome.REQUEST_MORE_INFO }]);
  assert.equal(request.information_request?.question, "Which conference?");
  assert.equal(request.information_request?.response_field_id, "responses.advisor_review__information_request_1");

  const repeat = inserted.steps[at + 2]!;
  assert.equal(repeat.origin, TaskStepOrigin.APPROVAL_REPEAT);
  assert.equal(repeat.definition_step_id, "advisor_review");
  assert.equal(repeat.assignee?.email, "advisor_review@u.c");
  assert.equal(repeat.approval?.decision, null);
  assert.equal(repeat.approval?.decided_via, null);
  assert.equal(repeat.approval?.decided_by_user_id, null);
  assert.deepEqual(repeat.depends_on, [{ step_id: "advisor_review__information_request_1", required_outcome: TaskStepOutcome.COMPLETED }]);

  for (const dependant of ["hod_review", "finance_review"]) {
    assert.deepEqual(inserted.steps.find((step) => step.id === dependant)?.depends_on, [
      { step_id: "advisor_review__repeat_1", required_outcome: TaskStepOutcome.APPROVED },
    ]);
  }

  const form = inserted.forms.find((candidate) => candidate.step_id === "advisor_review__information_request_1");
  const field = form?.sections[0]?.fields[0];
  assert.equal(form?.sections[0]?.kind, FormSectionKind.INFORMATION_RESPONSE);
  assert.equal(field?.control, FormFieldControl.TEXTAREA);
  assert.equal(field?.required, true);
  assert.equal(field?.label, "Which conference?");
  assert.deepEqual(field?.binding, { kind: FormFieldBindingKind.INFORMATION_RESPONSE, step_id: "advisor_review__information_request_1" });
});

test("a second request on the same definition step is numbered and wired to the latest repeat", () => {
  const definition = twoDependants();
  const task = buildTaskDocument(definition, definition.steps.map((step) => directoryResolution(step.id, step.id, `${step.id}@u.c`, "Dean")));

  const first = insertInformationRequest(task, "advisor_review", "One?", TASK_NOW);
  const second = insertInformationRequest(first, "advisor_review__repeat_1", "Two?", TASK_NOW);

  assert.ok(second.steps.some((step) => step.id === "advisor_review__information_request_2"));
  assert.deepEqual(second.steps.find((step) => step.id === "hod_review")?.depends_on[0]?.step_id, "advisor_review__repeat_2");
});
