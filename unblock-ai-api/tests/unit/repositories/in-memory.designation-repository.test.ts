import test from "node:test";
import assert from "node:assert/strict";
import { withErrorCode } from "../../helpers/error-assertion.helper.js";
import { createOrganisationWorld } from "../../helpers/organisation-world.helper.js";
import { OrganisationalUnitType } from "../../../src/data/constants/organisational-unit.constant.js";
import { DesignationCategory } from "../../../src/data/constants/designation.constant.js";
import { DesignationErrorCode } from "../../../src/data/constants/designation-error.constant.js";

test("list orders by display order and hides archived designations unless asked", async () => {
  const { repositories, director } = await createOrganisationWorld();
  const repository = repositories.designationRepository;

  assert.deepEqual(
    (await repository.list(false)).map((designation) => designation.code),
    ["dean", "head_of_department", "director", "lecturer"],
  );
  await repository.setArchivedAt(director.id, new Date());
  assert.deepEqual(
    (await repository.list(false)).map((designation) => designation.code),
    ["dean", "head_of_department", "lecturer"],
  );
  assert.equal((await repository.list(true)).length, 4);
});

test("create rejects duplicate codes and case-insensitive duplicate titles", async () => {
  const { repositories } = await createOrganisationWorld();
  const base = {
    category: DesignationCategory.ACADEMIC,
    applicableUnitTypes: [OrganisationalUnitType.DEPARTMENT],
    singleHolderPerUnit: false,
    displayOrder: 0,
    createdByUserId: null,
  };
  await assert.rejects(
    repositories.designationRepository.create({ ...base, code: "lecturer", title: "Another" }),
    withErrorCode(DesignationErrorCode.DESIGNATION_CODE_TAKEN),
  );
  await assert.rejects(
    repositories.designationRepository.create({ ...base, code: "other", title: "LECTURER" }),
    withErrorCode(DesignationErrorCode.DESIGNATION_TITLE_TAKEN),
  );
});

test("update blocks removing a unit type that still has holders", async () => {
  const { repositories, lecturer, engineering, computerScience, firstStaffMember } = await createOrganisationWorld();
  await repositories.userAffiliationRepository.replaceForUser(
    firstStaffMember.id,
    [{ organisationalUnitId: engineering.id, designationIds: [] }, { organisationalUnitId: computerScience.id, designationIds: [lecturer.id] }],
    firstStaffMember.id,
  );

  assert.deepEqual(await repositories.designationRepository.countHoldersByUnitType(lecturer.id), {
    [OrganisationalUnitType.FACULTY]: 0,
    [OrganisationalUnitType.DEPARTMENT]: 1,
    [OrganisationalUnitType.DIVISION]: 0,
  });
  await assert.rejects(
    repositories.designationRepository.update(lecturer.id, { applicableUnitTypes: [OrganisationalUnitType.FACULTY] }),
    withErrorCode(DesignationErrorCode.DESIGNATION_UNIT_TYPE_IN_USE),
  );

  const widened = await repositories.designationRepository.update(lecturer.id, {
    applicableUnitTypes: [OrganisationalUnitType.DEPARTMENT, OrganisationalUnitType.DIVISION],
  });
  assert.deepEqual(widened.applicableUnitTypes, [OrganisationalUnitType.DEPARTMENT, OrganisationalUnitType.DIVISION]);
});

test("update blocks enabling single holder while a unit has several holders", async () => {
  const { repositories, lecturer, engineering, computerScience, firstStaffMember, secondStaffMember } = await createOrganisationWorld();
  for (const member of [firstStaffMember, secondStaffMember]) {
    await repositories.userAffiliationRepository.replaceForUser(
      member.id,
      [{ organisationalUnitId: engineering.id, designationIds: [] }, { organisationalUnitId: computerScience.id, designationIds: [lecturer.id] }],
      member.id,
    );
  }

  assert.deepEqual(await repositories.designationRepository.findUnitsWithMultipleHolders(lecturer.id), [computerScience.id]);
  await assert.rejects(
    repositories.designationRepository.update(lecturer.id, { singleHolderPerUnit: true }),
    withErrorCode(DesignationErrorCode.DESIGNATION_SINGLE_HOLDER_VIOLATED),
  );
});

test("delete is blocked while the designation has holders", async () => {
  const { repositories, dean, engineering, firstStaffMember } = await createOrganisationWorld();
  await repositories.userAffiliationRepository.replaceForUser(
    firstStaffMember.id,
    [{ organisationalUnitId: engineering.id, designationIds: [dean.id] }],
    firstStaffMember.id,
  );
  await assert.rejects(repositories.designationRepository.delete(dean.id), withErrorCode(DesignationErrorCode.DESIGNATION_IN_USE));
  assert.equal((await repositories.designationRepository.findById(dean.id))?.holderCount, 1);
});
