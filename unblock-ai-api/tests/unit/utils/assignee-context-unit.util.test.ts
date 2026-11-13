import test from "node:test";
import assert from "node:assert/strict";
import { contextUnitIds } from "../../../src/utils/assignee/assignee-context-unit.util.js";
import { buildOrganisationCatalogue, sampleRequesterProfile, unitIdOf } from "../../helpers/organisation-catalogue.helper.js";
import type { DesignationRecord } from "../../../src/lib/types/designation/designation.type.js";

const catalogue = buildOrganisationCatalogue();

function designation(code: string): DesignationRecord {
  const record = catalogue.designationsByCode.get(code);
  if (!record) throw new Error(code);
  return record;
}

const OPEN = { actorType: "any" as const, organisationalUnitCodes: [] };
const FIT = { actorType: "any" as const, organisationalUnitCodes: ["FIT"] };

test("head of department looks in the requester's department", () => {
  const profile = sampleRequesterProfile("Ishara Bandara", catalogue);

  assert.deepEqual(contextUnitIds(profile, OPEN, designation("head_of_department"), catalogue), [unitIdOf("IT")]);
});

test("dean looks in the requester's effective faculty", () => {
  const profile = sampleRequesterProfile("Hasitha Dissanayake", catalogue);

  assert.deepEqual(contextUnitIds(profile, OPEN, designation("dean"), catalogue), [unitIdOf("FOE")]);
});

test("dean is found through a department-only audience", () => {
  const profile = sampleRequesterProfile("Ishara Bandara", catalogue);

  const ids = contextUnitIds(profile, { actorType: "any", organisationalUnitCodes: ["IT"] }, designation("dean"), catalogue);

  assert.deepEqual(ids, [unitIdOf("FIT")]);
});

test("registrar is looked up in every unit for a requester without a division membership", () => {
  const profile = sampleRequesterProfile("Hasitha Dissanayake", catalogue);

  assert.equal(contextUnitIds(profile, OPEN, designation("registrar"), catalogue), null);
});

test("a division-only designation is narrowed to the requester's division when they have one", () => {
  const profile = sampleRequesterProfile("Nadeesha Silva", catalogue);

  assert.deepEqual(contextUnitIds(profile, OPEN, designation("registrar"), catalogue), [unitIdOf("EXAM")]);
});

test("the CSE and IT dual member gets both departments with an empty audience", () => {
  const profile = sampleRequesterProfile("Nuwan Perera", catalogue);

  const ids = contextUnitIds(profile, OPEN, designation("head_of_department"), catalogue);

  assert.deepEqual([...(ids ?? [])].sort(), [unitIdOf("CSE"), unitIdOf("IT")].sort());
});

test("the CSE and IT dual member gets only IT with audience FIT", () => {
  const profile = sampleRequesterProfile("Nuwan Perera", catalogue);

  assert.deepEqual(contextUnitIds(profile, FIT, designation("head_of_department"), catalogue), [unitIdOf("IT")]);
  assert.deepEqual(contextUnitIds(profile, FIT, designation("dean"), catalogue), [unitIdOf("FIT")]);
});

test("a requester outside the audience gets no context unit rather than every unit", () => {
  const profile = sampleRequesterProfile("Hasitha Dissanayake", catalogue);

  assert.deepEqual(contextUnitIds(profile, FIT, designation("head_of_department"), catalogue), []);
});
