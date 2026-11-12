import test from "node:test";
import assert from "node:assert/strict";
import { UserAffiliationService } from "../../../src/services/user-affiliation.service.js";
import { UserAffiliationErrorCode, UserAffiliationIssueCode } from "../../../src/data/constants/user-affiliation-error.constant.js";
import { OrganisationalUnitErrorCode } from "../../../src/data/constants/organisational-unit-error.constant.js";
import { UserErrorCode } from "../../../src/data/constants/user-error.constant.js";
import { UserAffiliationValidationError } from "../../../src/errors/user-affiliation.error.js";
import { createOrganisationWorld, type OrganisationWorld } from "../../helpers/organisation-world.helper.js";
import { withErrorCode } from "../../helpers/error-assertion.helper.js";
import type { MembershipInput, UserAffiliationIssue } from "../../../src/lib/types/user-affiliation/user-affiliation.type.js";

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

async function build(): Promise<OrganisationWorld & { service: UserAffiliationService }> {
  const world = await createOrganisationWorld();
  const { userAffiliationRepository, organisationalUnitRepository, designationRepository, userRepository } = world.repositories;
  return {
    ...world,
    service: new UserAffiliationService({ userAffiliationRepository, organisationalUnitRepository, designationRepository, userRepository }),
  };
}

function replace(world: OrganisationWorld & { service: UserAffiliationService }, userId: string, memberships: MembershipInput[]) {
  return world.service.replaceForUser(userId, { memberships }, world.administrator.id);
}

async function rejectsWithIssues(promise: Promise<unknown>, expected: UserAffiliationIssue[]): Promise<void> {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof UserAffiliationValidationError);
    assert.equal(err.code, UserAffiliationErrorCode.USER_AFFILIATIONS_INVALID);
    assert.deepEqual(err.issues, expected);
    return true;
  });
}

test("BR-15/BR-20 replaceForUser stores the full state and reports effective faculties", async () => {
  const world = await build();
  const affiliations = await replace(world, world.firstStaffMember.id, [
    { organisationalUnitId: world.engineering.id, designationIds: [] },
    { organisationalUnitId: world.computerScience.id, designationIds: [world.headOfDepartment.id, world.lecturer.id] },
    { organisationalUnitId: world.examinations.id, designationIds: [] },
  ]);

  assert.deepEqual(
    affiliations.memberships.map((membership) => [
      membership.organisationalUnit.code,
      membership.designations.map((designation) => designation.code),
    ]),
    [
      ["FOE", []],
      ["CSE", ["head_of_department", "lecturer"]],
      ["EXAM", []],
    ],
  );
  assert.deepEqual(
    affiliations.effectiveFaculties.map((faculty) => faculty.code),
    ["FOE"],
  );

  const cleared = await replace(world, world.firstStaffMember.id, []);
  assert.deepEqual(cleared, { memberships: [], effectiveFaculties: [] });
});

test("BR-16 structural problems are reported before anything is loaded", async () => {
  const world = await build();
  await rejectsWithIssues(
    replace(world, UNKNOWN_ID, [
      { organisationalUnitId: world.computerScience.id, designationIds: [world.lecturer.id, world.lecturer.id] },
      { organisationalUnitId: world.computerScience.id, designationIds: [] },
    ]),
    [
      { code: UserAffiliationIssueCode.DUPLICATE_ORGANISATIONAL_UNIT, organisationalUnitId: world.computerScience.id, designationId: null },
      {
        code: UserAffiliationIssueCode.DUPLICATE_DESIGNATION,
        organisationalUnitId: world.computerScience.id,
        designationId: world.lecturer.id,
      },
    ],
  );
});

test("BR-17/BR-18 every rule breach in one request is reported together", async () => {
  const world = await build();
  await rejectsWithIssues(
    replace(world, world.firstStaffMember.id, [
      { organisationalUnitId: UNKNOWN_ID, designationIds: [world.lecturer.id] },
      { organisationalUnitId: world.examinations.id, designationIds: [world.headOfDepartment.id, UNKNOWN_ID] },
    ]),
    [
      { code: UserAffiliationIssueCode.ORGANISATIONAL_UNIT_NOT_FOUND, organisationalUnitId: UNKNOWN_ID, designationId: null },
      {
        code: UserAffiliationIssueCode.DESIGNATION_NOT_APPLICABLE,
        organisationalUnitId: world.examinations.id,
        designationId: world.headOfDepartment.id,
      },
      { code: UserAffiliationIssueCode.DESIGNATION_NOT_FOUND, organisationalUnitId: world.examinations.id, designationId: UNKNOWN_ID },
    ],
  );
});

test("a department membership requires membership of the department's faculty", async () => {
  const world = await build();
  await rejectsWithIssues(
    replace(world, world.firstStaffMember.id, [
      { organisationalUnitId: world.computerScience.id, designationIds: [world.lecturer.id] },
      { organisationalUnitId: world.examinations.id, designationIds: [] },
    ]),
    [{ code: UserAffiliationIssueCode.FACULTY_MEMBERSHIP_REQUIRED, organisationalUnitId: world.computerScience.id, designationId: null }],
  );

  await replace(world, world.firstStaffMember.id, [
    { organisationalUnitId: world.engineering.id, designationIds: [] },
    { organisationalUnitId: world.computerScience.id, designationIds: [world.lecturer.id] },
  ]);
  await rejectsWithIssues(
    replace(world, world.firstStaffMember.id, [
      { organisationalUnitId: world.computerScience.id, designationIds: [world.lecturer.id] },
    ]),
    [{ code: UserAffiliationIssueCode.FACULTY_MEMBERSHIP_REQUIRED, organisationalUnitId: world.computerScience.id, designationId: null }],
  );
});

test("BR-17 an archived unit cannot be newly joined but an existing membership may be retained", async () => {
  const world = await build();
  const { organisationalUnitRepository } = world.repositories;
  await replace(world, world.firstStaffMember.id, [{ organisationalUnitId: world.examinations.id, designationIds: [] }]);
  await organisationalUnitRepository.setArchivedAt(world.examinations.id, new Date());

  const retained = await replace(world, world.firstStaffMember.id, [{ organisationalUnitId: world.examinations.id, designationIds: [] }]);
  assert.equal(retained.memberships[0]?.organisationalUnit.isArchived, true);

  await rejectsWithIssues(
    replace(world, world.secondStaffMember.id, [{ organisationalUnitId: world.examinations.id, designationIds: [] }]),
    [{ code: UserAffiliationIssueCode.ORGANISATIONAL_UNIT_ARCHIVED, organisationalUnitId: world.examinations.id, designationId: null }],
  );
});

test("BR-18 an archived designation cannot be newly assigned but an existing assignment may be retained", async () => {
  const world = await build();
  const membership = [
    { organisationalUnitId: world.engineering.id, designationIds: [] },
    { organisationalUnitId: world.computerScience.id, designationIds: [world.lecturer.id] },
  ];
  await replace(world, world.firstStaffMember.id, membership);
  await world.repositories.designationRepository.setArchivedAt(world.lecturer.id, new Date());

  await replace(world, world.firstStaffMember.id, membership);
  await rejectsWithIssues(replace(world, world.secondStaffMember.id, membership), [
    { code: UserAffiliationIssueCode.DESIGNATION_ARCHIVED, organisationalUnitId: world.computerScience.id, designationId: world.lecturer.id },
  ]);
});

test("BR-19 a single-holder designation held by someone else is a 409 naming the holder", async () => {
  const world = await build();
  const membership = [
    { organisationalUnitId: world.engineering.id, designationIds: [] },
    { organisationalUnitId: world.computerScience.id, designationIds: [world.headOfDepartment.id] },
  ];
  await replace(world, world.firstStaffMember.id, membership);
  await replace(world, world.firstStaffMember.id, membership);

  await assert.rejects(replace(world, world.secondStaffMember.id, membership), (err: unknown) => {
    assert.ok(withErrorCode(UserAffiliationErrorCode.DESIGNATION_HOLDER_CONFLICT)(err));
    assert.deepEqual((err as { details: unknown }).details, {
      conflicts: [
        {
          designation_id: world.headOfDepartment.id,
          organisational_unit_id: world.computerScience.id,
          holder: { id: world.firstStaffMember.id, full_name: "Amara Perera", email: "amara@uom.lk" },
        },
      ],
    });
    return true;
  });
});

test("BR-21 unchanged memberships keep their original assignment time", async () => {
  const world = await build();
  const first = await replace(world, world.firstStaffMember.id, [{ organisationalUnitId: world.engineering.id, designationIds: [] }]);
  const second = await replace(world, world.firstStaffMember.id, [
    { organisationalUnitId: world.engineering.id, designationIds: [world.dean.id] },
  ]);
  assert.equal(second.memberships[0]?.assignedAt.getTime(), first.memberships[0]?.assignedAt.getTime());
});

test("getForUser and replaceForUser reject unknown users", async () => {
  const world = await build();
  await assert.rejects(world.service.getForUser(UNKNOWN_ID), withErrorCode(UserErrorCode.USER_NOT_FOUND));
  await assert.rejects(replace(world, UNKNOWN_ID, []), withErrorCode(UserErrorCode.USER_NOT_FOUND));
});

test("listUnitMembers lists members with their designations in that unit and rejects unknown units", async () => {
  const world = await build();
  await replace(world, world.firstStaffMember.id, [
    { organisationalUnitId: world.engineering.id, designationIds: [] },
    { organisationalUnitId: world.computerScience.id, designationIds: [world.lecturer.id] },
  ]);

  const members = await world.service.listUnitMembers(world.computerScience.id);
  assert.deepEqual(
    members.map((member) => [member.user.email, member.designations.map((designation) => designation.code)]),
    [["amara@uom.lk", ["lecturer"]]],
  );
  await assert.rejects(
    world.service.listUnitMembers(UNKNOWN_ID),
    withErrorCode(OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_NOT_FOUND),
  );
});
