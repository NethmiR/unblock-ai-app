import test from "node:test";
import assert from "node:assert/strict";
import { withErrorCode } from "../../helpers/error-assertion.helper.js";
import { createOrganisationWorld } from "../../helpers/organisation-world.helper.js";
import { UserAffiliationErrorCode } from "../../../src/data/constants/user-affiliation-error.constant.js";
import { DatabaseError } from "../../../src/errors/database.error.js";

test("replaceForUser stores memberships with designations, ordered by faculty then type", async () => {
  const world = await createOrganisationWorld();
  const { userAffiliationRepository } = world.repositories;

  await userAffiliationRepository.replaceForUser(
    world.firstStaffMember.id,
    [
      { organisationalUnitId: world.examinations.id, designationIds: [] },
      { organisationalUnitId: world.engineering.id, designationIds: [] },
      { organisationalUnitId: world.computerScience.id, designationIds: [world.lecturer.id, world.headOfDepartment.id] },
    ],
    world.administrator.id,
  );

  const memberships = await userAffiliationRepository.findMembershipsByUserId(world.firstStaffMember.id);
  assert.deepEqual(
    memberships.map((membership) => membership.organisationalUnit.code),
    ["FOE", "CSE", "EXAM"],
  );
  assert.deepEqual(
    memberships[1]!.designations.map((designation) => designation.code),
    ["head_of_department", "lecturer"],
  );
});

test("replaceForUser keeps the original assignment time of unchanged rows and removes dropped ones", async () => {
  const world = await createOrganisationWorld();
  const { userAffiliationRepository } = world.repositories;
  const userId = world.firstStaffMember.id;

  await userAffiliationRepository.replaceForUser(
    userId,
    [{ organisationalUnitId: world.engineering.id, designationIds: [] }, { organisationalUnitId: world.computerScience.id, designationIds: [world.lecturer.id] }],
    world.administrator.id,
  );
  const [original] = await userAffiliationRepository.findMembershipsByUserId(userId);

  await userAffiliationRepository.replaceForUser(
    userId,
    [
      { organisationalUnitId: world.computerScience.id, designationIds: [] },
      { organisationalUnitId: world.engineering.id, designationIds: [] },
    ],
    world.administrator.id,
  );
  const memberships = await userAffiliationRepository.findMembershipsByUserId(userId);
  const retained = memberships.find((membership) => membership.organisationalUnit.id === world.computerScience.id);
  assert.equal(retained?.assignedAt, original!.assignedAt);
  assert.deepEqual(retained?.designations, []);
  assert.equal(memberships.length, 2);

  await userAffiliationRepository.replaceForUser(userId, [], world.administrator.id);
  assert.deepEqual(await userAffiliationRepository.findMembershipsByUserId(userId), []);
});

test("replaceForUser rejects a second holder of a single-holder designation", async () => {
  const world = await createOrganisationWorld();
  const { userAffiliationRepository } = world.repositories;
  const membership = [{ organisationalUnitId: world.engineering.id, designationIds: [] }, { organisationalUnitId: world.computerScience.id, designationIds: [world.headOfDepartment.id] }];

  await userAffiliationRepository.replaceForUser(world.firstStaffMember.id, membership, world.administrator.id);
  await userAffiliationRepository.replaceForUser(world.firstStaffMember.id, membership, world.administrator.id);
  await assert.rejects(
    userAffiliationRepository.replaceForUser(world.secondStaffMember.id, membership, world.administrator.id),
    withErrorCode(UserAffiliationErrorCode.DESIGNATION_HOLDER_CONFLICT),
  );
});

test("replaceForUser enforces referential integrity like the database does", async () => {
  const world = await createOrganisationWorld();
  await assert.rejects(
    world.repositories.userAffiliationRepository.replaceForUser(
      world.firstStaffMember.id,
      [{ organisationalUnitId: world.examinations.id, designationIds: [world.headOfDepartment.id] }],
      world.administrator.id,
    ),
    DatabaseError,
  );
});

test("findMembersByUnitId, findSingleHolders and findUnitSummariesByUserIds read back the assignments", async () => {
  const world = await createOrganisationWorld();
  const { userAffiliationRepository } = world.repositories;
  await userAffiliationRepository.replaceForUser(
    world.secondStaffMember.id,
    [{ organisationalUnitId: world.engineering.id, designationIds: [] }, { organisationalUnitId: world.computerScience.id, designationIds: [world.headOfDepartment.id] }],
    world.administrator.id,
  );
  await userAffiliationRepository.replaceForUser(
    world.firstStaffMember.id,
    [{ organisationalUnitId: world.engineering.id, designationIds: [] }, { organisationalUnitId: world.computerScience.id, designationIds: [world.lecturer.id] }],
    world.administrator.id,
  );

  const members = await userAffiliationRepository.findMembersByUnitId(world.computerScience.id);
  assert.deepEqual(
    members.map((member) => [member.user.fullName, member.designations.map((designation) => designation.code)]),
    [
      ["Amara Perera", ["lecturer"]],
      ["Bandara Silva", ["head_of_department"]],
    ],
  );

  const holders = await userAffiliationRepository.findSingleHolders([
    { designationId: world.headOfDepartment.id, organisationalUnitId: world.computerScience.id },
    { designationId: world.lecturer.id, organisationalUnitId: world.computerScience.id },
  ]);
  assert.deepEqual(
    holders.map((holder) => holder.holder.id),
    [world.secondStaffMember.id],
  );

  const summaries = await userAffiliationRepository.findUnitSummariesByUserIds([world.firstStaffMember.id, world.administrator.id]);
  assert.deepEqual(
    summaries.get(world.firstStaffMember.id)?.map((unit) => unit.code),
    ["FOE", "CSE"],
  );
  assert.deepEqual(summaries.get(world.administrator.id), []);
});

test("replaceForUser rejects a department membership without its faculty, like the database trigger", async () => {
  const world = await createOrganisationWorld();
  await assert.rejects(
    world.repositories.userAffiliationRepository.replaceForUser(
      world.firstStaffMember.id,
      [{ organisationalUnitId: world.computerScience.id, designationIds: [] }],
      world.administrator.id,
    ),
    withErrorCode(UserAffiliationErrorCode.USER_AFFILIATIONS_INVALID),
  );
  assert.deepEqual(await world.repositories.userAffiliationRepository.findMembershipsByUserId(world.firstStaffMember.id), []);
});
