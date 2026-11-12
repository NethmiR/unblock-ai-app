import test from "node:test";
import assert from "node:assert/strict";
import { startAuthTestServer, type AuthTestServer } from "../helpers/auth-test-server.helper.js";
import { TEST_USERS, TestIdentity } from "../helpers/test-server.helper.js";
import { HttpMethod, readJson, sendJson } from "../helpers/http-request.helper.js";
import { AuthErrorCode } from "../../src/data/constants/auth.constant.js";
import { DesignationCategory } from "../../src/data/constants/designation.constant.js";
import { OrganisationalUnitType } from "../../src/data/constants/organisational-unit.constant.js";
import { UserAffiliationErrorCode, UserAffiliationIssueCode } from "../../src/data/constants/user-affiliation-error.constant.js";
import { UserErrorCode } from "../../src/data/constants/user-error.constant.js";
import type { OrganisationalUnitMemberDto, OrganisationalUnitSummaryDto } from "../../src/lib/types/organisational-unit/organisational-unit.type.js";
import type { DesignationSummaryDto } from "../../src/lib/types/designation/designation.type.js";
import type { UserAffiliationsDto } from "../../src/lib/types/user-affiliation/user-affiliation.type.js";
import type { UserListResponseDto } from "../../src/lib/types/user/user.type.js";
import type { ErrorResponseBody } from "../../src/lib/types/http/http.type.js";

interface Structure {
  faculty: OrganisationalUnitSummaryDto;
  department: OrganisationalUnitSummaryDto;
  headOfDepartment: DesignationSummaryDto;
  lecturer: DesignationSummaryDto;
}

const TASK_CREATOR_ID = TEST_USERS[TestIdentity.TASK_CREATOR].id;
const WORKFLOW_MANAGER_ID = TEST_USERS[TestIdentity.WORKFLOW_MANAGER].id;

async function withServer(run: (server: AuthTestServer, structure: Structure) => Promise<void>): Promise<void> {
  const server = await startAuthTestServer();
  try {
    await run(server, await createStructure(server));
  } finally {
    await server.close();
  }
}

async function post<T>(server: AuthTestServer, path: string, body: unknown): Promise<T> {
  const response = await sendJson(server.baseUrl, HttpMethod.POST, path, TestIdentity.ORGANISATION_MANAGER, body);
  assert.equal(response.status, 201, path);
  return readJson<T>(response);
}

async function createStructure(server: AuthTestServer): Promise<Structure> {
  const { organisational_unit: faculty } = await post<{ organisational_unit: OrganisationalUnitSummaryDto }>(server, "/organisational-units", {
    code: "FOE",
    name: "Faculty of Engineering",
    unit_type: OrganisationalUnitType.FACULTY,
  });
  const { organisational_unit: department } = await post<{ organisational_unit: OrganisationalUnitSummaryDto }>(server, "/organisational-units", {
    code: "CSE",
    name: "Department of Computer Science & Engineering",
    unit_type: OrganisationalUnitType.DEPARTMENT,
    parent_id: faculty.id,
  });
  const { designation: headOfDepartment } = await post<{ designation: DesignationSummaryDto }>(server, "/designations", {
    code: "head_of_department",
    title: "Head of Department",
    category: DesignationCategory.LEADERSHIP,
    applicable_unit_types: [OrganisationalUnitType.DEPARTMENT],
    single_holder_per_unit: true,
    display_order: 70,
  });
  const { designation: lecturer } = await post<{ designation: DesignationSummaryDto }>(server, "/designations", {
    code: "lecturer",
    title: "Lecturer",
    category: DesignationCategory.ACADEMIC,
    applicable_unit_types: [OrganisationalUnitType.FACULTY, OrganisationalUnitType.DEPARTMENT],
    single_holder_per_unit: false,
    display_order: 150,
  });
  return { faculty, department, headOfDepartment, lecturer };
}

function putAffiliations(server: AuthTestServer, userId: string, memberships: unknown, identity = TestIdentity.USER_MANAGER) {
  return sendJson(server.baseUrl, HttpMethod.PUT, `/users/${userId}/affiliations`, identity, { memberships });
}

test("a user manager replaces and reads a user's affiliations; the user sees them on /auth/me", async () => {
  await withServer(async (server, { faculty, department, headOfDepartment, lecturer }) => {
    const saved = await putAffiliations(server, TASK_CREATOR_ID, [
      { organisational_unit_id: department.id, designation_ids: [lecturer.id, headOfDepartment.id] },
      { organisational_unit_id: faculty.id, designation_ids: [] },
    ]);
    assert.equal(saved.status, 200);
    const { affiliations } = await readJson<{ affiliations: UserAffiliationsDto }>(saved);
    assert.deepEqual(
      affiliations.memberships.map((membership) => membership.organisational_unit.code),
      ["FOE", "CSE"],
    );
    assert.equal(affiliations.memberships[1]!.organisational_unit.parent?.id, faculty.id);
    assert.deepEqual(
      affiliations.memberships[1]!.designations.map((designation) => designation.code),
      ["head_of_department", "lecturer"],
    );
    assert.deepEqual(
      affiliations.effective_faculties.map((unit) => unit.code),
      ["FOE"],
    );

    const fetched = await sendJson(server.baseUrl, HttpMethod.GET, `/users/${TASK_CREATOR_ID}/affiliations`, TestIdentity.USER_MANAGER);
    assert.deepEqual(await readJson<{ affiliations: UserAffiliationsDto }>(fetched), { affiliations });

    const own = await sendJson(server.baseUrl, HttpMethod.GET, "/auth/me/affiliations", TestIdentity.TASK_CREATOR);
    assert.deepEqual(await readJson<{ affiliations: UserAffiliationsDto }>(own), { affiliations });

    const otherUser = await sendJson(server.baseUrl, HttpMethod.GET, "/auth/me/affiliations", TestIdentity.WORKFLOW_MANAGER);
    assert.deepEqual(await readJson<{ affiliations: UserAffiliationsDto }>(otherUser), {
      affiliations: { memberships: [], effective_faculties: [] },
    });
  });
});

test("affiliation management requires user:manage", async () => {
  await withServer(async (server, { department }) => {
    const membership = [{ organisational_unit_id: department.id, designation_ids: [] }];
    for (const response of [
      await putAffiliations(server, TASK_CREATOR_ID, membership, TestIdentity.ORGANISATION_MANAGER),
      await sendJson(server.baseUrl, HttpMethod.GET, `/users/${TASK_CREATOR_ID}/affiliations`, TestIdentity.TASK_CREATOR),
    ]) {
      assert.equal(response.status, 403);
      assert.equal((await readJson<ErrorResponseBody>(response)).code, AuthErrorCode.PERMISSION_DENIED);
    }
    assert.equal((await sendJson(server.baseUrl, HttpMethod.GET, "/auth/me/affiliations", null)).status, 401);
  });
});

test("rule breaches return 400 with every issue, and conflicts return 409 naming the holder", async () => {
  await withServer(async (server, { faculty, department, headOfDepartment }) => {
    const invalid = await putAffiliations(server, TASK_CREATOR_ID, [
      { organisational_unit_id: faculty.id, designation_ids: [headOfDepartment.id] },
      { organisational_unit_id: faculty.id, designation_ids: [] },
    ]);
    assert.equal(invalid.status, 400);
    const invalidBody = await readJson<ErrorResponseBody>(invalid);
    assert.equal(invalidBody.code, UserAffiliationErrorCode.USER_AFFILIATIONS_INVALID);
    assert.deepEqual(invalidBody.details, {
      issues: [{ code: UserAffiliationIssueCode.DUPLICATE_ORGANISATIONAL_UNIT, organisational_unit_id: faculty.id, designation_id: null }],
    });

    const notApplicable = await putAffiliations(server, TASK_CREATOR_ID, [
      { organisational_unit_id: faculty.id, designation_ids: [headOfDepartment.id] },
    ]);
    assert.deepEqual((await readJson<ErrorResponseBody>(notApplicable)).details, {
      issues: [
        {
          code: UserAffiliationIssueCode.DESIGNATION_NOT_APPLICABLE,
          organisational_unit_id: faculty.id,
          designation_id: headOfDepartment.id,
        },
      ],
    });

    const withoutFaculty = await putAffiliations(server, TASK_CREATOR_ID, [
      { organisational_unit_id: department.id, designation_ids: [] },
    ]);
    assert.equal(withoutFaculty.status, 400);
    assert.deepEqual((await readJson<ErrorResponseBody>(withoutFaculty)).details, {
      issues: [
        { code: UserAffiliationIssueCode.FACULTY_MEMBERSHIP_REQUIRED, organisational_unit_id: department.id, designation_id: null },
      ],
    });

    const headMembership = [
      { organisational_unit_id: faculty.id, designation_ids: [] },
      { organisational_unit_id: department.id, designation_ids: [headOfDepartment.id] },
    ];
    assert.equal((await putAffiliations(server, TASK_CREATOR_ID, headMembership)).status, 200);
    const conflict = await putAffiliations(server, WORKFLOW_MANAGER_ID, headMembership);
    assert.equal(conflict.status, 409);
    const conflictBody = await readJson<ErrorResponseBody>(conflict);
    assert.equal(conflictBody.code, UserAffiliationErrorCode.DESIGNATION_HOLDER_CONFLICT);
    assert.deepEqual(conflictBody.details, {
      conflicts: [
        {
          designation_id: headOfDepartment.id,
          organisational_unit_id: department.id,
          holder: { id: TASK_CREATOR_ID, full_name: "Test Task Creator", email: "task-creator@example.com" },
        },
      ],
    });
  });
});

test("malformed payloads and unknown users are rejected", async () => {
  await withServer(async (server, { department }) => {
    for (const memberships of [
      undefined,
      [{ organisational_unit_id: "nope", designation_ids: [] }],
      [{ organisational_unit_id: department.id }],
      [{ organisational_unit_id: department.id, designation_ids: ["nope"] }],
      ["not-an-object"],
    ]) {
      assert.equal((await putAffiliations(server, TASK_CREATOR_ID, memberships)).status, 400, JSON.stringify(memberships));
    }

    const unknown = await putAffiliations(server, "00000000-0000-4000-8000-0000000000ff", []);
    assert.equal(unknown.status, 404);
    assert.equal((await readJson<ErrorResponseBody>(unknown)).code, UserErrorCode.USER_NOT_FOUND);
  });
});

test("unit members are visible to user or organisation managers only", async () => {
  await withServer(async (server, { faculty, department, lecturer }) => {
    await putAffiliations(server, TASK_CREATOR_ID, [
      { organisational_unit_id: faculty.id, designation_ids: [] },
      { organisational_unit_id: department.id, designation_ids: [lecturer.id] },
    ]);
    const path = `/organisational-units/${department.id}/members`;

    assert.equal((await sendJson(server.baseUrl, HttpMethod.GET, path, TestIdentity.TASK_CREATOR)).status, 403);
    for (const identity of [TestIdentity.USER_MANAGER, TestIdentity.ORGANISATION_MANAGER]) {
      const response = await sendJson(server.baseUrl, HttpMethod.GET, path, identity);
      assert.equal(response.status, 200);
      const { members } = await readJson<{ members: OrganisationalUnitMemberDto[] }>(response);
      assert.deepEqual(
        members.map((member) => [member.user.id, member.designations.map((designation) => designation.code)]),
        [[TASK_CREATOR_ID, ["lecturer"]]],
      );
    }
  });
});

test("the user list filters by unit and search, paginates and carries unit summaries", async () => {
  await withServer(async (server, { faculty, department }) => {
    await putAffiliations(server, TASK_CREATOR_ID, [
      { organisational_unit_id: faculty.id, designation_ids: [] },
      { organisational_unit_id: department.id, designation_ids: [] },
    ]);

    const filtered = await readJson<UserListResponseDto>(
      await sendJson(server.baseUrl, HttpMethod.GET, `/users?organisational_unit_id=${faculty.id}`, TestIdentity.USER_MANAGER),
    );
    assert.deepEqual(
      filtered.users.map((user) => [user.id, user.organisational_units.map((unit) => unit.code)]),
      [[TASK_CREATOR_ID, ["FOE", "CSE"]]],
    );
    assert.equal(filtered.page.total, 1);

    const searched = await readJson<UserListResponseDto>(
      await sendJson(server.baseUrl, HttpMethod.GET, "/users?search=manager&limit=2&offset=1", TestIdentity.USER_MANAGER),
    );
    assert.equal(searched.users.length, 2);
    assert.deepEqual(searched.page, { total: 3, limit: 2, offset: 1 });

    for (const query of ["limit=0", "limit=abc", "offset=-1", "organisational_unit_id=nope"]) {
      assert.equal((await sendJson(server.baseUrl, HttpMethod.GET, `/users?${query}`, TestIdentity.USER_MANAGER)).status, 400, query);
    }
  });
});
