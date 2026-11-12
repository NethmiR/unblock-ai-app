import test from "node:test";
import assert from "node:assert/strict";
import { findStructuralIssues } from "../../../src/utils/user-affiliation/membership-input.util.js";
import { resolveEffectiveFaculties } from "../../../src/utils/user-affiliation/effective-faculty.util.js";
import { compareOrganisationalUnits } from "../../../src/utils/user-affiliation/membership-order.util.js";
import { compareDesignations } from "../../../src/utils/organisation/designation-reference.util.js";
import { toOrganisationalUnitReference } from "../../../src/utils/organisation/organisational-unit-reference.util.js";
import { USER_AFFILIATION_LIMIT } from "../../../src/data/constants/user-affiliation.constant.js";
import { UserAffiliationIssueCode } from "../../../src/data/constants/user-affiliation-error.constant.js";
import { OrganisationalUnitType } from "../../../src/data/constants/organisational-unit.constant.js";
import { designationReference, organisationalUnitRecord } from "../../helpers/organisation-fixture.helper.js";

const engineering = organisationalUnitRecord({ id: "f-eng", code: "FOE", name: "Faculty of Engineering" });
const architecture = organisationalUnitRecord({ id: "f-arc", code: "FOA", name: "Faculty of Architecture" });
const computerScience = organisationalUnitRecord({
  id: "d-cse",
  code: "CSE",
  name: "Department of Computer Science & Engineering",
  unitType: OrganisationalUnitType.DEPARTMENT,
  parent: toOrganisationalUnitReference(engineering),
});
const civil = organisationalUnitRecord({
  id: "d-ce",
  code: "CE",
  name: "Department of Civil Engineering",
  unitType: OrganisationalUnitType.DEPARTMENT,
  parent: toOrganisationalUnitReference(engineering),
});
const engineeringUndergraduate = organisationalUnitRecord({
  id: "v-foe-ugsd",
  code: "FOE-UGSD",
  name: "Undergraduate Studies Division",
  unitType: OrganisationalUnitType.DIVISION,
  parent: toOrganisationalUnitReference(engineering),
});
const examinations = organisationalUnitRecord({
  id: "v-exam",
  code: "EXAM",
  name: "Examinations & Registration Division",
  unitType: OrganisationalUnitType.DIVISION,
});

test("findStructuralIssues accepts a well-formed payload", () => {
  assert.deepEqual(
    findStructuralIssues([
      { organisationalUnitId: "a", designationIds: ["x", "y"] },
      { organisationalUnitId: "b", designationIds: [] },
    ]),
    [],
  );
});

test("findStructuralIssues reports duplicate units and duplicate designations", () => {
  const issues = findStructuralIssues([
    { organisationalUnitId: "a", designationIds: ["x", "x"] },
    { organisationalUnitId: "a", designationIds: [] },
  ]);
  assert.deepEqual(issues, [
    { code: UserAffiliationIssueCode.DUPLICATE_ORGANISATIONAL_UNIT, organisationalUnitId: "a", designationId: null },
    { code: UserAffiliationIssueCode.DUPLICATE_DESIGNATION, organisationalUnitId: "a", designationId: "x" },
  ]);
});

test("findStructuralIssues enforces the membership and designation limits", () => {
  const tooManyMemberships = Array.from({ length: USER_AFFILIATION_LIMIT.MAX_MEMBERSHIPS + 1 }, (_, index) => ({
    organisationalUnitId: `unit-${index}`,
    designationIds: [],
  }));
  assert.deepEqual(findStructuralIssues(tooManyMemberships).map((issue) => issue.code), [
    UserAffiliationIssueCode.TOO_MANY_MEMBERSHIPS,
  ]);

  const tooManyDesignations = Array.from(
    { length: USER_AFFILIATION_LIMIT.MAX_DESIGNATIONS_PER_MEMBERSHIP + 1 },
    (_, index) => `designation-${index}`,
  );
  assert.deepEqual(findStructuralIssues([{ organisationalUnitId: "a", designationIds: tooManyDesignations }]), [
    { code: UserAffiliationIssueCode.TOO_MANY_DESIGNATIONS, organisationalUnitId: "a", designationId: null },
  ]);
});

test("resolveEffectiveFaculties combines explicit faculties with the parents of child units", () => {
  const faculties = resolveEffectiveFaculties([computerScience, architecture, engineering, engineeringUndergraduate, examinations]);
  assert.deepEqual(
    faculties.map((faculty) => faculty.code),
    ["FOA", "FOE"],
  );
});

test("resolveEffectiveFaculties returns nothing for university-level divisions only", () => {
  assert.deepEqual(resolveEffectiveFaculties([examinations]), []);
});

test("compareOrganisationalUnits groups by faculty, then type, then name, with university-level units last", () => {
  const ordered = [examinations, civil, engineeringUndergraduate, architecture, computerScience, engineering].sort(
    compareOrganisationalUnits,
  );
  assert.deepEqual(
    ordered.map((unit) => unit.code),
    ["FOA", "FOE", "CE", "CSE", "FOE-UGSD", "EXAM"],
  );
});

test("compareDesignations orders by display order, then title", () => {
  const ordered = [
    designationReference({ code: "lecturer", title: "Lecturer", displayOrder: 50 }),
    designationReference({ code: "professor", title: "Professor", displayOrder: 20 }),
    designationReference({ code: "associate", title: "Associate Professor", displayOrder: 20 }),
  ].sort(compareDesignations);
  assert.deepEqual(
    ordered.map((designation) => designation.code),
    ["associate", "professor", "lecturer"],
  );
});
