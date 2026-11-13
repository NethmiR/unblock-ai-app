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

function addRequesterFormStep(workflow: ReturnType<typeof loadExpectedFixture>, collects: string[]): void {
  const base = workflow.steps[0]!;
  workflow.steps.push({
    ...base,
    id: "travel_documents",
    type: "data_collection",
    assignee: { resolution: "requester", role: null, relative_to: null, directory_query: null, fallback_role: null, display_name: null },
    depends_on: [{ step_id: base.id, required_outcome: "approved" }],
    collects_inputs: collects,
  });
}

test("a requester data_collection step may collect requester inputs", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  addRequesterFormStep(workflow, ["destination_city"]);

  assert.deepEqual(validateGraph(workflow), []);
});

test("collects_inputs rejects unknown inputs and inputs listed twice", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  addRequesterFormStep(workflow, ["passport_number", "destination_city", "destination_city"]);

  const errors = validateGraph(workflow);
  assert(errors.some((e) => e.includes("unknown input 'passport_number'")));
  assert(errors.some((e) => e.includes("Input 'destination_city' is collected by both")));
});

test("collects_inputs rejects inputs not collected from the requester", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  workflow.inputs[0]!.collected_from = { ...workflow.inputs[0]!.collected_from, resolution: "system" };
  addRequesterFormStep(workflow, [workflow.inputs[0]!.id]);

  assert(validateGraph(workflow).some((e) => e.includes("not collected from the requester")));
});

test("collects_inputs must be empty on steps that are not requester data_collection steps", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  workflow.steps[0]!.collects_inputs = ["destination_city"];

  assert(validateGraph(workflow).some((e) => e.includes("is not a data_collection step assigned to the requester")));
});

test("requester paths must name a requester attribute", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  const condition = {
    operator: "equals" as const,
    left: "requester.faculty",
    right: "Faculty of Information Technology",
    clauses: [],
    description: null,
  };
  workflow.steps[2]!.condition = condition;
  assert.deepEqual(validateGraph(workflow), []);

  workflow.steps[2]!.condition = { ...condition, left: "requester.index_number" };
  assert(validateGraph(workflow).some((e) => e.includes("unknown path 'requester.index_number'")));
});
