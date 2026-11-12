import test from "node:test";
import assert from "node:assert/strict";
import {
  canHaveParent,
  isAllowedParent,
  requiresParent,
} from "../../../src/utils/organisation/organisational-unit-hierarchy.util.js";
import { OrganisationalUnitType } from "../../../src/data/constants/organisational-unit.constant.js";

const { FACULTY, DEPARTMENT, DIVISION } = OrganisationalUnitType;

test("a faculty takes no parent", () => {
  assert.equal(requiresParent(FACULTY), false);
  assert.equal(canHaveParent(FACULTY), false);
  assert.equal(isAllowedParent(FACULTY, null), true);
  for (const parentType of [FACULTY, DEPARTMENT, DIVISION]) {
    assert.equal(isAllowedParent(FACULTY, parentType), false, parentType);
  }
});

test("a department requires a faculty parent", () => {
  assert.equal(requiresParent(DEPARTMENT), true);
  assert.equal(isAllowedParent(DEPARTMENT, null), false);
  assert.equal(isAllowedParent(DEPARTMENT, FACULTY), true);
  assert.equal(isAllowedParent(DEPARTMENT, DEPARTMENT), false);
  assert.equal(isAllowedParent(DEPARTMENT, DIVISION), false);
});

test("a division may sit at university level or under a faculty", () => {
  assert.equal(requiresParent(DIVISION), false);
  assert.equal(canHaveParent(DIVISION), true);
  assert.equal(isAllowedParent(DIVISION, null), true);
  assert.equal(isAllowedParent(DIVISION, FACULTY), true);
  assert.equal(isAllowedParent(DIVISION, DEPARTMENT), false);
  assert.equal(isAllowedParent(DIVISION, DIVISION), false);
});
