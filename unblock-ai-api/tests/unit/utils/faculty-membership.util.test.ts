import test from "node:test";
import assert from "node:assert/strict";
import { isMissingFacultyMembership, requiredFacultyIdOf } from "../../../src/utils/user-affiliation/faculty-membership.util.js";
import { toOrganisationalUnitReference } from "../../../src/utils/organisation/organisational-unit-reference.util.js";
import { OrganisationalUnitType } from "../../../src/data/constants/organisational-unit.constant.js";
import { organisationalUnitRecord } from "../../helpers/organisation-fixture.helper.js";

const engineering = organisationalUnitRecord({ id: "f-eng" });
const computerScience = organisationalUnitRecord({
  id: "d-cse",
  code: "CSE",
  unitType: OrganisationalUnitType.DEPARTMENT,
  parent: toOrganisationalUnitReference(engineering),
});
const facultyDivision = organisationalUnitRecord({
  id: "v-ugsd",
  code: "FOE-UGSD",
  unitType: OrganisationalUnitType.DIVISION,
  parent: toOrganisationalUnitReference(engineering),
});

test("requiredFacultyIdOf is the parent faculty of a department and null otherwise", () => {
  assert.equal(requiredFacultyIdOf(computerScience), engineering.id);
  assert.equal(requiredFacultyIdOf(engineering), null);
  assert.equal(requiredFacultyIdOf(facultyDivision), null);
});

test("isMissingFacultyMembership flags a department whose faculty is not among the memberships", () => {
  assert.equal(isMissingFacultyMembership(computerScience, new Set([computerScience.id])), true);
  assert.equal(isMissingFacultyMembership(computerScience, new Set([computerScience.id, engineering.id])), false);
  assert.equal(isMissingFacultyMembership(facultyDivision, new Set([facultyDivision.id])), false);
});
