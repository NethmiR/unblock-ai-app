import test from "node:test";
import assert from "node:assert/strict";
import { ValidationService } from "../../../src/services/validation.service.js";
import { expectedFixtureNames, loadExpectedFixture } from "../../helpers/fixture.helper.js";
import { buildOrganisationCatalogue } from "../../helpers/organisation-catalogue.helper.js";

const catalogue = buildOrganisationCatalogue();

for (const file of expectedFixtureNames()) {
  test(`fixture ${file} passes ValidationService.validate with the seed catalogue`, () => {
    assert.deepEqual(new ValidationService().validate(loadExpectedFixture(file), catalogue), []);
  });
}

test("validate reports graph and audience errors together", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  workflow.scope.applies_to.organisational_unit_codes = ["NOPE"];
  workflow.steps[0]!.collects_inputs = ["destination_city"];

  const errors = new ValidationService().validate(workflow, catalogue);

  assert.ok(errors.some((error) => error.includes("'NOPE'")));
  assert.ok(errors.some((error) => error.includes("collects_inputs")));
});

test("validate rejects a definition missing the new required properties", () => {
  const workflow = loadExpectedFixture("departmental_event_workshop.json");
  const { collects_inputs: _collects, ...legacyStep } = workflow.steps[0]!;
  const invalid = { ...workflow, steps: [legacyStep, ...workflow.steps.slice(1)] };

  assert.ok(new ValidationService().validate(invalid, catalogue).length > 0);
});
