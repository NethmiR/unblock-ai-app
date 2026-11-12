import test from "node:test";
import assert from "node:assert/strict";
import { DesignationService } from "../../../src/services/designation.service.js";
import { DesignationCategory } from "../../../src/data/constants/designation.constant.js";
import { DesignationErrorCode } from "../../../src/data/constants/designation-error.constant.js";
import { OrganisationalUnitType } from "../../../src/data/constants/organisational-unit.constant.js";
import { ValidationError } from "../../../src/errors/validation.error.js";
import { createOrganisationWorld, membershipsFor, type OrganisationWorld } from "../../helpers/organisation-world.helper.js";
import { withErrorCode } from "../../helpers/error-assertion.helper.js";
import type { CreateDesignationInput } from "../../../src/lib/types/designation/designation.type.js";

async function build(): Promise<OrganisationWorld & { service: DesignationService }> {
  const world = await createOrganisationWorld();
  return { ...world, service: new DesignationService({ designationRepository: world.repositories.designationRepository }) };
}

function designationInput(overrides: Partial<CreateDesignationInput> = {}): CreateDesignationInput {
  return {
    code: " Senior_Lecturer_Grade_I ",
    title: "  Senior  Lecturer (Grade I) ",
    category: DesignationCategory.ACADEMIC,
    applicableUnitTypes: [OrganisationalUnitType.DEPARTMENT, OrganisationalUnitType.FACULTY],
    singleHolderPerUnit: false,
    displayOrder: 130,
    ...overrides,
  };
}

async function assign(world: OrganisationWorld, userId: string, unitId: string, designationIds: string[]): Promise<void> {
  await world.repositories.userAffiliationRepository.replaceForUser(
    userId,
    membershipsFor(world, unitId, designationIds),
    world.administrator.id,
  );
}

test("BR-9/BR-10/BR-11 create normalises code and title and orders unit types", async () => {
  const { service, administrator } = await build();
  const designation = await service.create(designationInput(), administrator.id);
  assert.equal(designation.code, "senior_lecturer_grade_i");
  assert.equal(designation.title, "Senior Lecturer (Grade I)");
  assert.deepEqual(designation.applicableUnitTypes, [OrganisationalUnitType.FACULTY, OrganisationalUnitType.DEPARTMENT]);
  assert.equal(designation.createdByUserId, administrator.id);
  assert.equal(designation.holderCount, 0);
});

test("BR-9 create rejects malformed codes", async () => {
  const { service } = await build();
  for (const code of ["", "senior-lecturer", "_dean", "dean__x", "a".repeat(65)]) {
    await assert.rejects(service.create(designationInput({ code }), null), ValidationError, code);
  }
});

test("BR-10/BR-11 create rejects bad titles, empty or duplicate unit types and out-of-range display order", async () => {
  const { service } = await build();
  await assert.rejects(service.create(designationInput({ title: " " }), null), ValidationError);
  await assert.rejects(service.create(designationInput({ title: "x".repeat(121) }), null), ValidationError);
  await assert.rejects(service.create(designationInput({ applicableUnitTypes: [] }), null), ValidationError);
  await assert.rejects(
    service.create(
      designationInput({ applicableUnitTypes: [OrganisationalUnitType.FACULTY, OrganisationalUnitType.FACULTY] }),
      null,
    ),
    ValidationError,
  );
  for (const displayOrder of [-1, 10000, 1.5]) {
    await assert.rejects(service.create(designationInput({ displayOrder }), null), ValidationError, String(displayOrder));
  }
});

test("BR-10 create rejects a case-insensitive duplicate title", async () => {
  const { service } = await build();
  await assert.rejects(
    service.create(designationInput({ code: "another_lecturer", title: "lecturer" }), null),
    withErrorCode(DesignationErrorCode.DESIGNATION_TITLE_TAKEN),
  );
});

test("BR-12 removing a unit type with holders is blocked; unused types can be removed", async () => {
  const world = await build();
  await assign(world, world.firstStaffMember.id, world.computerScience.id, [world.lecturer.id]);

  await assert.rejects(world.service.update(world.lecturer.id, { applicableUnitTypes: [OrganisationalUnitType.FACULTY] }), (err: unknown) => {
    assert.ok(withErrorCode(DesignationErrorCode.DESIGNATION_UNIT_TYPE_IN_USE)(err));
    assert.deepEqual((err as { details: unknown }).details, { unit_type: OrganisationalUnitType.DEPARTMENT, holder_count: 1 });
    return true;
  });

  const narrowed = await world.service.update(world.lecturer.id, { applicableUnitTypes: [OrganisationalUnitType.DEPARTMENT] });
  assert.deepEqual(narrowed.applicableUnitTypes, [OrganisationalUnitType.DEPARTMENT]);
});

test("BR-13 enabling single holder is blocked while a unit has several holders", async () => {
  const world = await build();
  await assign(world, world.firstStaffMember.id, world.computerScience.id, [world.lecturer.id]);
  await assign(world, world.secondStaffMember.id, world.computerScience.id, [world.lecturer.id]);

  await assert.rejects(world.service.update(world.lecturer.id, { singleHolderPerUnit: true }), (err: unknown) => {
    assert.ok(withErrorCode(DesignationErrorCode.DESIGNATION_SINGLE_HOLDER_VIOLATED)(err));
    assert.deepEqual((err as { details: unknown }).details, { organisational_unit_ids: [world.computerScience.id] });
    return true;
  });
});

test("BR-13 single holder can be enabled once every unit has at most one holder", async () => {
  const world = await build();
  await assign(world, world.firstStaffMember.id, world.computerScience.id, [world.lecturer.id]);
  const updated = await world.service.update(world.lecturer.id, { singleHolderPerUnit: true, title: "Lecturer In Charge" });
  assert.equal(updated.singleHolderPerUnit, true);
  assert.equal(updated.title, "Lecturer In Charge");
});

test("BR-14 archive and restore are idempotent; delete is blocked while holders exist", async () => {
  const world = await build();
  const archived = await world.service.archive(world.director.id);
  assert.equal(archived.isArchived, true);
  assert.equal((await world.service.archive(world.director.id)).isArchived, true);
  assert.equal((await world.service.restore(world.director.id)).isArchived, false);

  await assign(world, world.firstStaffMember.id, world.engineering.id, [world.dean.id]);
  await assert.rejects(world.service.delete(world.dean.id), withErrorCode(DesignationErrorCode.DESIGNATION_IN_USE));

  await world.service.delete(world.director.id);
  await assert.rejects(world.service.getById(world.director.id), withErrorCode(DesignationErrorCode.DESIGNATION_NOT_FOUND));
});

test("findByCode normalises the code", async () => {
  const { service, headOfDepartment } = await build();
  assert.equal((await service.findByCode(" HEAD_OF_DEPARTMENT "))?.id, headOfDepartment.id);
  assert.equal(await service.findByCode("unknown"), null);
});
