import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidOrganisationalUnitCode,
  normalizeOrganisationalUnitCode,
} from "../../../src/utils/organisation/organisational-unit-code.util.js";
import { isValidDesignationCode, normalizeDesignationCode } from "../../../src/utils/organisation/designation-code.util.js";
import { ORGANISATIONAL_UNIT_FIELD_LIMIT } from "../../../src/data/constants/organisational-unit.constant.js";
import { DESIGNATION_FIELD_LIMIT } from "../../../src/data/constants/designation.constant.js";

test("normalizeOrganisationalUnitCode trims and upper-cases", () => {
  assert.equal(normalizeOrganisationalUnitCode("  foe-ugsd "), "FOE-UGSD");
});

test("isValidOrganisationalUnitCode accepts abbreviations with hyphen-separated segments", () => {
  for (const code of ["FOE", "CSE", "FOE-UGSD", "A1", "MEDTECH"]) {
    assert.equal(isValidOrganisationalUnitCode(code), true, code);
  }
});

test("isValidOrganisationalUnitCode rejects malformed and overlong codes", () => {
  for (const code of ["", "foe", "1FOE", "FOE-", "-FOE", "FOE--UGSD", "FOE UGSD", "FOE_UGSD"]) {
    assert.equal(isValidOrganisationalUnitCode(code), false, code);
  }
  assert.equal(isValidOrganisationalUnitCode("A".repeat(ORGANISATIONAL_UNIT_FIELD_LIMIT.CODE_MAX_LENGTH + 1)), false);
});

test("normalizeDesignationCode trims and lower-cases", () => {
  assert.equal(normalizeDesignationCode("  Head_Of_Department "), "head_of_department");
});

test("isValidDesignationCode accepts lower snake case slugs", () => {
  for (const code of ["dean", "head_of_department", "senior_lecturer_grade_i", "grade2"]) {
    assert.equal(isValidDesignationCode(code), true, code);
  }
});

test("isValidDesignationCode rejects malformed and overlong codes", () => {
  for (const code of ["", "Dean", "_dean", "dean_", "head__of", "head-of-department", "2dean"]) {
    assert.equal(isValidDesignationCode(code), false, code);
  }
  assert.equal(isValidDesignationCode("a".repeat(DESIGNATION_FIELD_LIMIT.CODE_MAX_LENGTH + 1)), false);
});
