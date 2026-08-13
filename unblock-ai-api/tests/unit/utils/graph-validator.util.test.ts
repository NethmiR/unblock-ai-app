import test from "node:test";
import assert from "node:assert/strict";
import { validateGraph } from "../../../src/utils/workflow/graph-validator.util.js";
import { expectedFixtureNames, loadExpectedFixture } from "../../helpers/fixture.helper.js";

for (const file of expectedFixtureNames()) {
  test(`fixture ${file} passes graph validation`, () => {
    const workflow = loadExpectedFixture(file);
    assert.deepEqual(validateGraph(workflow), []);
  });
}

test("detects a depends_on referencing an unknown step", () => {
  const workflow = loadExpectedFixture("departmental_event_workshop.json");
  workflow.steps[2]!.depends_on = [{ step_id: "hall_booking_2", required_outcome: "approved" }];

  const errors = validateGraph(workflow);
  assert(errors.some((e) => e.includes("unknown step 'hall_booking_2'")));
});

test("detects a required_outcome that does not exist on the target step", () => {
  const workflow = loadExpectedFixture("departmental_event_workshop.json");
  workflow.steps[2]!.depends_on = [{ step_id: "hall_booking", required_outcome: "confirmed" }];

  const errors = validateGraph(workflow);
  assert(errors.some((e) => e.includes("no such outcome")));
});

test("detects a dependency cycle", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  workflow.steps[0]!.depends_on = [{ step_id: "dean_review", required_outcome: "approved" }];

  const errors = validateGraph(workflow);
  assert(errors.some((e) => e.includes("cycle")));
});

test("detects a workflow with no entry step", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  workflow.steps[0]!.depends_on = [{ step_id: "hod_review", required_outcome: "approved" }];

  const errors = validateGraph(workflow);
  assert(errors.some((e) => e.includes("no entry point")));
});

test("detects an unreachable step", () => {
  const workflow = loadExpectedFixture("departmental_event_workshop.json");
  workflow.steps.push({
    ...workflow.steps[0]!,
    id: "isolated_gate",
    depends_on: [{ step_id: "orphan_step", required_outcome: "approved" }],
  });
  workflow.steps.push({
    ...workflow.steps[0]!,
    id: "orphan_step",
    depends_on: [{ step_id: "isolated_gate", required_outcome: "approved" }],
  });

  const errors = validateGraph(workflow);
  assert(errors.some((e) => e.includes("orphan_step") && e.includes("unreachable")));
  assert(errors.some((e) => e.includes("isolated_gate") && e.includes("unreachable")));
});

test("detects an approval step missing approved/rejected outcomes", () => {
  const workflow = loadExpectedFixture("departmental_event_workshop.json");
  workflow.steps[0]!.outcomes = { ...workflow.steps[0]!.outcomes, rejected: null };

  const errors = validateGraph(workflow);
  assert(errors.some((e) => e.includes("missing a 'rejected' outcome")));
});

test("detects completion.required_steps referencing an unknown step", () => {
  const workflow = loadExpectedFixture("departmental_event_workshop.json");
  workflow.completion.required_steps.push("nonexistent_step");

  const errors = validateGraph(workflow);
  assert(errors.some((e) => e.includes("completion.required_steps") && e.includes("nonexistent_step")));
});

test("detects a condition referencing an unknown computed path", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  workflow.steps[2]!.condition!.left = "computed.trip_duration";

  const errors = validateGraph(workflow);
  assert(errors.some((e) => e.includes("unknown path 'computed.trip_duration'")));
});

test("detects context_from_steps referencing an undeclared response field", () => {
  const workflow = loadExpectedFixture("departmental_event_workshop.json");
  workflow.steps[2]!.context_from_steps = [{ step_id: "hall_booking", field: "room_layout", as: "layout" }];

  const errors = validateGraph(workflow);
  assert(errors.some((e) => e.includes("unknown path 'steps.hall_booking.response.room_layout'")));
});
