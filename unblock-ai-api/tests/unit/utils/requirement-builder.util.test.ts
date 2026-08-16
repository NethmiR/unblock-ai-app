import test from "node:test";
import assert from "node:assert/strict";
import { buildRequirements } from "../../../src/utils/task/requirement-builder.util.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";

test("it_faculty_overseas_leave: 7 input requirements then 3 actor requirements, in order", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  const requirements = buildRequirements(workflow);

  const inputs = requirements.filter((r) => r.source === "input");
  const actors = requirements.filter((r) => r.source === "actor");

  assert.equal(inputs.length, 7);
  assert.equal(actors.length, 3);
  assert.deepEqual(
    requirements.map((r) => r.source),
    [...Array(7).fill("input"), ...Array(3).fill("actor")],
  );
  assert.deepEqual(
    actors.map((r) => r.key),
    ["actor:advisor_review", "actor:hod_review", "actor:dean_review"],
  );
});

test("it_faculty_overseas_leave: input requirements preserve declaration order and key = input id", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  const requirements = buildRequirements(workflow);
  const inputKeys = requirements.filter((r) => r.source === "input").map((r) => r.key);

  assert.deepEqual(inputKeys, [
    "full_name",
    "student_index_number",
    "destination_country",
    "destination_city",
    "departure_date",
    "return_date",
    "travel_reason",
  ]);
});

test("it_faculty_overseas_leave: actor requirement is typed 'person' with a derived label and hint", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  const requirements = buildRequirements(workflow);
  const advisor = requirements.find((r) => r.key === "actor:advisor_review");

  assert.ok(advisor);
  assert.equal(advisor?.type, "person");
  assert.equal(advisor?.required, true);
  assert.equal(advisor?.label, "Academic Advisor");
  assert.equal(advisor?.collection_hint, "Name and email address of your Academic Advisor.");
  assert.equal(advisor?.ref, "advisor_review");
  assert.equal(advisor?.status, "pending");
});

test("departmental_event_workshop: all assignees are static, so there are zero actor requirements", () => {
  const workflow = loadExpectedFixture("departmental_event_workshop.json");
  const requirements = buildRequirements(workflow);

  assert.equal(requirements.filter((r) => r.source === "actor").length, 0);
  assert.equal(requirements.filter((r) => r.source === "input").length, 2);
});

test("dynamic actors sharing role + relative_to de-duplicate into a single requirement", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  workflow.steps.push({
    ...workflow.steps[1]!,
    id: "hod_second_look",
    depends_on: [{ step_id: "hod_review", required_outcome: "approved" }],
  });

  const requirements = buildRequirements(workflow);
  const actorKeys = requirements.filter((r) => r.source === "actor").map((r) => r.key);

  assert.deepEqual(actorKeys, ["actor:advisor_review", "actor:hod_review", "actor:dean_review"]);
});
