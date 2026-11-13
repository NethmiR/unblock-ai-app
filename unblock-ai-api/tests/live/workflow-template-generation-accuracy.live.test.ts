import { test } from "node:test";
import assert from "node:assert/strict";
import { readInputFixture, stepById } from "../helpers/live.helper.js";
import { generateDefinition } from "./workflow-template-generation.helper.js";

test("IT Faculty Overseas Leave — structural generation", async () => {
  const workflow = await generateDefinition(readInputFixture("it_faculty_overseas_leave.txt"));

  assert.equal(workflow.inputs.length, 6);
  assert.deepEqual(workflow.scope.applies_to.organisational_unit_codes, ["FIT"]);
  const inputIds = workflow.inputs.map((input) => input.id);
  for (const forbidden of ["full_name", "requester_email", "email", "name"]) {
    assert.ok(!inputIds.includes(forbidden), `the requester's ${forbidden} must come from the account, not an input`);
  }

  const advisorReview = stepById(workflow, "advisor_review");
  const hodReview = stepById(workflow, "hod_review");
  const deanReview = stepById(workflow, "dean_review");

  assert.ok(advisorReview, "advisor_review step must exist");
  assert.ok(hodReview, "hod_review step must exist");
  assert.ok(deanReview, "dean_review step must exist");

  assert.equal(hodReview?.assignee.resolution, "dynamic");
  assert.equal(hodReview?.assignee.role, "head_of_department");
  assert.equal(deanReview?.assignee.resolution, "dynamic");
  assert.equal(deanReview?.assignee.role, "dean");
  assert.ok(workflow.steps.every((step) => step.collects_inputs.length === 0));

  assert.equal(advisorReview?.depends_on.length, 0);
  assert.equal(hodReview?.depends_on[0]?.step_id, "advisor_review");
  assert.equal(hodReview?.depends_on[0]?.required_outcome, "approved");
  assert.equal(deanReview?.depends_on[0]?.step_id, "hod_review");

  assert.equal(deanReview?.condition?.operator, "greater_than");
  assert.equal(deanReview?.condition?.left, "computed.trip_duration_days");
  assert.equal(deanReview?.condition?.right, 30);

  assert.equal(advisorReview?.outcomes.request_more_info?.return_to_step, "self");
  assert.equal(advisorReview?.outcomes.rejected?.action, "terminate_workflow");

  assert.equal(workflow.completion.required_steps.includes("dean_review"), true);
});

test("Departmental Event & Workshop — structural generation", async () => {
  const workflow = await generateDefinition(readInputFixture("departmental_event_workshop.txt"));

  const hallBooking = stepById(workflow, "hall_booking");
  const speakerClearance = stepById(workflow, "speaker_clearance");
  const refreshments = stepById(workflow, "refreshments_approval");

  assert.ok(hallBooking, "hall_booking step must exist");
  assert.ok(speakerClearance, "speaker_clearance step must exist");
  assert.ok(refreshments, "refreshments_approval step must exist");

  assert.equal(hallBooking?.depends_on.length, 0);
  assert.equal(speakerClearance?.depends_on.length, 0);

  assert.equal(refreshments?.initial_state, "blocked");
  assert.equal(refreshments?.depends_on[0]?.step_id, "hall_booking");
  assert.equal(refreshments?.depends_on[0]?.required_outcome, "approved");

  assert.ok(
    refreshments?.context_from_steps.some(
      (binding) => binding.step_id === "hall_booking" && binding.field === "confirmed_capacity",
    ),
    "refreshments_approval must read hall_booking's confirmed_capacity",
  );

  assert.deepEqual(
    new Set(workflow.completion.required_steps),
    new Set(["hall_booking", "speaker_clearance", "refreshments_approval"]),
  );
});
