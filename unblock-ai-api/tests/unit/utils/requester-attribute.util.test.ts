import test from "node:test";
import assert from "node:assert/strict";
import { RequesterAttribute } from "../../../src/data/constants/requester.constant.js";
import { requesterAttributeValues } from "../../../src/utils/requester/requester-attribute.util.js";
import { sampleRequesterProfile } from "../../helpers/organisation-catalogue.helper.js";

test("single-valued attributes come from the profile", () => {
  const values = requesterAttributeValues(sampleRequesterProfile("Chamari Gunawardena"));

  assert.equal(values[RequesterAttribute.FULL_NAME], "Chamari Gunawardena");
  assert.equal(values[RequesterAttribute.EMAIL], "u4@u.c");
  assert.equal(values[RequesterAttribute.FACULTY], "Faculty of Engineering");
  assert.equal(values[RequesterAttribute.DEPARTMENT], "Department of Computer Science & Engineering");
  assert.equal(values[RequesterAttribute.DIVISION], null);
  assert.equal(values[RequesterAttribute.DESIGNATIONS], "Head of Department, Senior Lecturer (Grade I)");
});

test("ambiguous attributes are null", () => {
  const values = requesterAttributeValues(sampleRequesterProfile("Nuwan Perera"));

  assert.equal(values[RequesterAttribute.FACULTY], null);
  assert.equal(values[RequesterAttribute.DEPARTMENT], null);
});

test("a user without memberships has no unit attributes or designations", () => {
  const values = requesterAttributeValues(sampleRequesterProfile("Lahiru Ekanayake"));

  assert.equal(values[RequesterAttribute.FACULTY], null);
  assert.equal(values[RequesterAttribute.DESIGNATIONS], null);
});
