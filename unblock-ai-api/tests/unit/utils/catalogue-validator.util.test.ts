import test from "node:test";
import assert from "node:assert/strict";
import { checkAudienceCodes } from "../../../src/utils/workflow/catalogue-validator.util.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import { buildOrganisationCatalogue } from "../../helpers/organisation-catalogue.helper.js";

test("known, active audience codes pass", () => {
  assert.deepEqual(checkAudienceCodes(loadExpectedFixture("it_faculty_overseas_leave.json"), buildOrganisationCatalogue()), []);
});

test("an unknown audience code is reported", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  workflow.scope.applies_to.organisational_unit_codes = ["FIT", "NOPE"];

  const errors = checkAudienceCodes(workflow, buildOrganisationCatalogue());

  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /unknown organisational unit 'NOPE'/);
});

test("an archived audience code is reported", () => {
  const base = buildOrganisationCatalogue();
  const units = base.units.map((unit) => (unit.code === "FIT" ? { ...unit, isArchived: true } : unit));
  const catalogue = buildOrganisationCatalogue(units, base.designations);

  const errors = checkAudienceCodes(loadExpectedFixture("it_faculty_overseas_leave.json"), catalogue);

  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /archived organisational unit 'FIT'/);
});
