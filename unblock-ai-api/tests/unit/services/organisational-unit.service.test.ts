import test from "node:test";
import assert from "node:assert/strict";
import { OrganisationalUnitService } from "../../../src/services/organisational-unit.service.js";
import { OrganisationalUnitType } from "../../../src/data/constants/organisational-unit.constant.js";
import { OrganisationalUnitErrorCode } from "../../../src/data/constants/organisational-unit-error.constant.js";
import { ValidationError } from "../../../src/errors/validation.error.js";
import { createOrganisationWorld, type OrganisationWorld } from "../../helpers/organisation-world.helper.js";
import { withErrorCode } from "../../helpers/error-assertion.helper.js";
import type { CreateOrganisationalUnitInput } from "../../../src/lib/types/organisational-unit/organisational-unit.type.js";

async function build(): Promise<OrganisationWorld & { service: OrganisationalUnitService }> {
  const world = await createOrganisationWorld();
  return {
    ...world,
    service: new OrganisationalUnitService({ organisationalUnitRepository: world.repositories.organisationalUnitRepository }),
  };
}

function departmentInput(parentId: string | null, overrides: Partial<CreateOrganisationalUnitInput> = {}): CreateOrganisationalUnitInput {
  return {
    code: " ce ",
    name: "  Department  of Civil   Engineering ",
    unitType: OrganisationalUnitType.DEPARTMENT,
    parentId,
    description: "   ",
    ...overrides,
  };
}

test("BR-1/BR-2 create normalises code, name and description and records the actor", async () => {
  const { service, engineering, administrator } = await build();
  const unit = await service.create(departmentInput(engineering.id), administrator.id);
  assert.equal(unit.code, "CE");
  assert.equal(unit.name, "Department of Civil Engineering");
  assert.equal(unit.description, null);
  assert.equal(unit.createdByUserId, administrator.id);
  assert.equal(unit.parent?.code, "FOE");
});

test("BR-1 create rejects malformed codes", async () => {
  const { service, engineering } = await build();
  for (const code of ["", "C E", "C_E", "-CE", "A".repeat(25)]) {
    await assert.rejects(service.create(departmentInput(engineering.id, { code }), null), ValidationError, code);
  }
});

test("BR-2 create rejects empty and overlong names and overlong descriptions", async () => {
  const { service, engineering } = await build();
  await assert.rejects(service.create(departmentInput(engineering.id, { name: "   " }), null), ValidationError);
  await assert.rejects(service.create(departmentInput(engineering.id, { name: "x".repeat(201) }), null), ValidationError);
  await assert.rejects(service.create(departmentInput(engineering.id, { description: "x".repeat(1001) }), null), ValidationError);
});

test("BR-4 a department requires an existing, active faculty parent", async () => {
  const { service, examinations } = await build();
  const parentInvalid = withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_PARENT_INVALID);

  await assert.rejects(service.create(departmentInput(null), null), parentInvalid);
  await assert.rejects(service.create(departmentInput(examinations.id), null), parentInvalid);
  await assert.rejects(service.create(departmentInput("00000000-0000-4000-8000-000000000000"), null), parentInvalid);

  const archivedFaculty = await service.create(
    { code: "FOA", name: "Faculty of Architecture", unitType: OrganisationalUnitType.FACULTY, parentId: null, description: null },
    null,
  );
  await service.archive(archivedFaculty.id);
  await assert.rejects(
    service.create(departmentInput(archivedFaculty.id, { code: "ARCH", name: "Department of Architecture" }), null),
    withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_PARENT_ARCHIVED),
  );
});

test("BR-4 a faculty cannot have a parent and a division may sit at either level", async () => {
  const { service, engineering } = await build();
  await assert.rejects(
    service.create(
      { code: "FOX", name: "Faculty X", unitType: OrganisationalUnitType.FACULTY, parentId: engineering.id, description: null },
      null,
    ),
    withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_PARENT_INVALID),
  );

  const facultyDivision = await service.create(
    { code: "FOE-UGSD", name: "Undergraduate Studies Division", unitType: OrganisationalUnitType.DIVISION, parentId: engineering.id, description: null },
    null,
  );
  const universityDivision = await service.create(
    { code: "LIB", name: "Library", unitType: OrganisationalUnitType.DIVISION, parentId: null, description: null },
    null,
  );
  assert.equal(facultyDivision.parent?.id, engineering.id);
  assert.equal(universityDivision.parent, null);
});

test("BR-3/BR-5 update renames and re-parents but never changes type or code", async () => {
  const { service, engineering, examinations } = await build();
  const moved = await service.update(examinations.id, { name: "Examinations Division", parentId: engineering.id });
  assert.equal(moved.parent?.id, engineering.id);
  assert.equal(moved.code, "EXAM");
  assert.equal(moved.unitType, OrganisationalUnitType.DIVISION);

  const backToUniversity = await service.update(examinations.id, { parentId: null });
  assert.equal(backToUniversity.parent, null);
});

test("BR-5 update rejects making a unit its own parent or orphaning a department", async () => {
  const { service, computerScience, engineering } = await build();
  await assert.rejects(
    service.update(engineering.id, { parentId: engineering.id }),
    withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_PARENT_INVALID),
  );
  await assert.rejects(
    service.update(computerScience.id, { parentId: null }),
    withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_PARENT_INVALID),
  );
});

test("a department with members cannot move to another faculty, but can be renamed or moved once empty", async () => {
  const { service, repositories, engineering, computerScience, firstStaffMember } = await build();
  const architecture = await service.create(
    { code: "FOA", name: "Faculty of Architecture", unitType: OrganisationalUnitType.FACULTY, parentId: null, description: null },
    null,
  );
  await repositories.userAffiliationRepository.replaceForUser(
    firstStaffMember.id,
    [
      { organisationalUnitId: engineering.id, designationIds: [] },
      { organisationalUnitId: computerScience.id, designationIds: [] },
    ],
    null,
  );

  await assert.rejects(service.update(computerScience.id, { parentId: architecture.id }), (err: unknown) => {
    assert.ok(withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_HAS_MEMBERS)(err));
    assert.deepEqual((err as { details: unknown }).details, { field: "parent_id", member_count: 1 });
    return true;
  });
  const renamed = await service.update(computerScience.id, { name: "Department of Computing", parentId: engineering.id });
  assert.equal(renamed.parent?.id, engineering.id);

  await repositories.userAffiliationRepository.replaceForUser(firstStaffMember.id, [], null);
  const moved = await service.update(computerScience.id, { parentId: architecture.id });
  assert.equal(moved.parent?.id, architecture.id);
});

test("BR-6 archive is blocked while active children exist and is idempotent", async () => {
  const { service, engineering, computerScience } = await build();
  await assert.rejects(
    service.archive(engineering.id),
    withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_HAS_ACTIVE_CHILDREN),
  );

  const archivedDepartment = await service.archive(computerScience.id);
  assert.equal(archivedDepartment.isArchived, true);
  assert.equal((await service.archive(computerScience.id)).archivedAt?.getTime(), archivedDepartment.archivedAt?.getTime());

  assert.equal((await service.archive(engineering.id)).isArchived, true);
});

test("BR-7 restore is blocked while the parent is archived", async () => {
  const { service, engineering, computerScience } = await build();
  await service.archive(computerScience.id);
  await service.archive(engineering.id);

  await assert.rejects(
    service.restore(computerScience.id),
    withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_PARENT_ARCHIVED),
  );
  await service.restore(engineering.id);
  assert.equal((await service.restore(computerScience.id)).isArchived, false);
});

test("BR-8 delete is blocked while the unit has members or children, with counts in details", async () => {
  const { service, repositories, engineering, computerScience, firstStaffMember } = await build();
  await repositories.userAffiliationRepository.replaceForUser(
    firstStaffMember.id,
    [{ organisationalUnitId: engineering.id, designationIds: [] }, { organisationalUnitId: computerScience.id, designationIds: [] }],
    firstStaffMember.id,
  );

  await assert.rejects(service.delete(computerScience.id), (err: unknown) => {
    assert.ok(withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_IN_USE)(err));
    assert.deepEqual((err as { details: unknown }).details, { member_count: 1, child_count: 0 });
    return true;
  });
  await assert.rejects(service.delete(engineering.id), withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_IN_USE));
});

test("getById and findByCode resolve units; unknown ids are NOT_FOUND", async () => {
  const { service, computerScience } = await build();
  assert.equal((await service.findByCode(" cse "))?.id, computerScience.id);
  await assert.rejects(
    service.getById("00000000-0000-4000-8000-000000000000"),
    withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_NOT_FOUND),
  );
});

test("list rejects root_only combined with parent_id", async () => {
  const { service, engineering } = await build();
  await assert.rejects(
    service.list({ unitType: null, parentId: engineering.id, rootOnly: true, includeArchived: false }),
    ValidationError,
  );
});
