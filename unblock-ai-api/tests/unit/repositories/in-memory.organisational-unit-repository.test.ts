import test from "node:test";
import assert from "node:assert/strict";
import { withErrorCode } from "../../helpers/error-assertion.helper.js";
import { createOrganisationWorld } from "../../helpers/organisation-world.helper.js";
import { OrganisationalUnitType } from "../../../src/data/constants/organisational-unit.constant.js";
import { OrganisationalUnitErrorCode } from "../../../src/data/constants/organisational-unit-error.constant.js";
import type { OrganisationalUnitListFilter } from "../../../src/lib/types/organisational-unit/organisational-unit.type.js";

const ALL: OrganisationalUnitListFilter = { unitType: null, parentId: null, rootOnly: false, includeArchived: true };

test("create returns a summary with parent reference and zero usage", async () => {
  const { computerScience, engineering } = await createOrganisationWorld();
  assert.equal(computerScience.parent?.id, engineering.id);
  assert.equal(computerScience.parent?.unitType, OrganisationalUnitType.FACULTY);
  assert.equal(computerScience.memberCount, 0);
  assert.equal(computerScience.isArchived, false);
});

test("list filters by type, parent, root level and archive state, ordered by faculty then type", async () => {
  const { repositories, engineering, computerScience, examinations } = await createOrganisationWorld();
  const repository = repositories.organisationalUnitRepository;

  assert.deepEqual(
    (await repository.list(ALL)).map((unit) => unit.code),
    ["FOE", "CSE", "EXAM"],
  );
  assert.deepEqual(
    (await repository.list({ ...ALL, unitType: OrganisationalUnitType.DIVISION })).map((unit) => unit.id),
    [examinations.id],
  );
  assert.deepEqual(
    (await repository.list({ ...ALL, parentId: engineering.id })).map((unit) => unit.id),
    [computerScience.id],
  );
  assert.deepEqual(
    (await repository.list({ ...ALL, rootOnly: true })).map((unit) => unit.code),
    ["FOE", "EXAM"],
  );

  await repository.setArchivedAt(examinations.id, new Date());
  assert.deepEqual(
    (await repository.list({ ...ALL, includeArchived: false })).map((unit) => unit.code),
    ["FOE", "CSE"],
  );
});

test("create rejects a duplicate code and a duplicate sibling name", async () => {
  const { repositories, engineering } = await createOrganisationWorld();
  const repository = repositories.organisationalUnitRepository;

  await assert.rejects(
    repository.create({
      code: "FOE",
      name: "Another Faculty",
      unitType: OrganisationalUnitType.FACULTY,
      parent: null,
      description: null,
      createdByUserId: null,
    }),
    withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_CODE_TAKEN),
  );
  await assert.rejects(
    repository.create({
      code: "CSE2",
      name: "department of computer science & engineering",
      unitType: OrganisationalUnitType.DEPARTMENT,
      parent: { id: engineering.id, unitType: engineering.unitType },
      description: null,
      createdByUserId: null,
    }),
    withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_NAME_TAKEN),
  );
});

test("create allows the same name under different parents", async () => {
  const { repositories, engineering } = await createOrganisationWorld();
  const repository = repositories.organisationalUnitRepository;
  const architecture = await repository.create({
    code: "FOA",
    name: "Faculty of Architecture",
    unitType: OrganisationalUnitType.FACULTY,
    parent: null,
    description: null,
    createdByUserId: null,
  });

  for (const parent of [engineering, architecture]) {
    await repository.create({
      code: `${parent.code}-UGSD`,
      name: "Undergraduate Studies Division",
      unitType: OrganisationalUnitType.DIVISION,
      parent: { id: parent.id, unitType: parent.unitType },
      description: null,
      createdByUserId: null,
    });
  }
  assert.equal((await repository.list({ ...ALL, unitType: OrganisationalUnitType.DIVISION })).length, 3);
});

test("create enforces the hierarchy like the database does", async () => {
  const { repositories, examinations } = await createOrganisationWorld();
  await assert.rejects(
    repositories.organisationalUnitRepository.create({
      code: "BAD",
      name: "Department under a division",
      unitType: OrganisationalUnitType.DEPARTMENT,
      parent: { id: examinations.id, unitType: examinations.unitType },
      description: null,
      createdByUserId: null,
    }),
    withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_PARENT_INVALID),
  );
});

test("update renames, re-parents and clears descriptions", async () => {
  const { repositories, examinations, engineering } = await createOrganisationWorld();
  const updated = await repositories.organisationalUnitRepository.update(examinations.id, {
    name: "Examinations Division",
    parent: { id: engineering.id, unitType: engineering.unitType },
    description: null,
  });
  assert.equal(updated.name, "Examinations Division");
  assert.equal(updated.parent?.id, engineering.id);
});

test("delete is blocked while the unit has children or members", async () => {
  const { repositories, engineering, computerScience, firstStaffMember } = await createOrganisationWorld();
  const repository = repositories.organisationalUnitRepository;

  await assert.rejects(repository.delete(engineering.id), withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_IN_USE));

  await repositories.userAffiliationRepository.replaceForUser(
    firstStaffMember.id,
    [{ organisationalUnitId: engineering.id, designationIds: [] }, { organisationalUnitId: computerScience.id, designationIds: [] }],
    firstStaffMember.id,
  );
  await assert.rejects(repository.delete(computerScience.id), withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_IN_USE));

  await repositories.userAffiliationRepository.replaceForUser(firstStaffMember.id, [], firstStaffMember.id);
  await repository.delete(computerScience.id);
  assert.equal(await repository.findById(computerScience.id), null);
});

test("findByCode and findByIds return records, skipping unknown ids", async () => {
  const { repositories, computerScience } = await createOrganisationWorld();
  const repository = repositories.organisationalUnitRepository;
  assert.equal((await repository.findByCode("CSE"))?.id, computerScience.id);
  assert.equal(await repository.findByCode("NOPE"), null);
  assert.deepEqual(
    (await repository.findByIds([computerScience.id, "00000000-0000-4000-8000-000000000000"])).map((unit) => unit.id),
    [computerScience.id],
  );
});

test("update refuses to move a department away from a faculty its members belong to, like the database trigger", async () => {
  const { repositories, engineering, computerScience, firstStaffMember } = await createOrganisationWorld();
  const repository = repositories.organisationalUnitRepository;
  const architecture = await repository.create({
    code: "FOA",
    name: "Faculty of Architecture",
    unitType: OrganisationalUnitType.FACULTY,
    parent: null,
    description: null,
    createdByUserId: null,
  });
  await repositories.userAffiliationRepository.replaceForUser(
    firstStaffMember.id,
    [
      { organisationalUnitId: engineering.id, designationIds: [] },
      { organisationalUnitId: computerScience.id, designationIds: [] },
    ],
    firstStaffMember.id,
  );
  const moveToArchitecture = { parent: { id: architecture.id, unitType: architecture.unitType } };

  await assert.rejects(
    repository.update(computerScience.id, moveToArchitecture),
    withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_HAS_MEMBERS),
  );

  await repositories.userAffiliationRepository.replaceForUser(
    firstStaffMember.id,
    [
      { organisationalUnitId: engineering.id, designationIds: [] },
      { organisationalUnitId: architecture.id, designationIds: [] },
      { organisationalUnitId: computerScience.id, designationIds: [] },
    ],
    firstStaffMember.id,
  );
  assert.equal((await repository.update(computerScience.id, moveToArchitecture)).parent?.id, architecture.id);
});
