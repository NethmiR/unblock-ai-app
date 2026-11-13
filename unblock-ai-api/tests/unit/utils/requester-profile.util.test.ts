import test from "node:test";
import assert from "node:assert/strict";
import { RequesterProfileFactKind } from "../../../src/data/constants/requester.constant.js";
import { sampleRequesterProfile } from "../../helpers/organisation-catalogue.helper.js";

test("a student gets numbered unit facts followed by their designation facts and the student actor type", () => {
  const profile = sampleRequesterProfile("Hasitha Dissanayake");

  assert.deepEqual(
    profile.facts.map((fact) => [fact.id, fact.kind, fact.unit.code, fact.designation?.code ?? null]),
    [
      ["P1", RequesterProfileFactKind.MEMBER_OF_UNIT, "FOE", null],
      ["P2", RequesterProfileFactKind.MEMBER_OF_UNIT, "CSE", null],
      ["P3", RequesterProfileFactKind.HOLDS_DESIGNATION, "CSE", "student"],
    ],
  );
  assert.equal(profile.facts[1]?.parent?.code, "FOE");
  assert.deepEqual(profile.actorTypes, ["student"]);
  assert.deepEqual(profile.effectiveFaculties.map((faculty) => faculty.code), ["FOE"]);
});

test("a lecturer is derived as faculty and staff, de-duplicated across memberships", () => {
  const profile = sampleRequesterProfile("Nuwan Perera");

  assert.deepEqual([...profile.actorTypes].sort(), ["faculty", "staff"]);
  assert.equal(profile.facts.length, 6);
  assert.deepEqual(profile.effectiveFaculties.map((faculty) => faculty.code).sort(), ["FIT", "FOE"]);
});

test("a user with no memberships has no facts and unknown actor types", () => {
  const profile = sampleRequesterProfile("Lahiru Ekanayake");

  assert.deepEqual(profile.facts, []);
  assert.deepEqual(profile.actorTypes, []);
  assert.deepEqual(profile.units, []);
});
