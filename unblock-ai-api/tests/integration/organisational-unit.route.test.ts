import test from "node:test";
import assert from "node:assert/strict";
import { startAuthTestServer, type AuthTestServer } from "../helpers/auth-test-server.helper.js";
import { TestIdentity } from "../helpers/test-server.helper.js";
import { HttpMethod, readJson, sendJson } from "../helpers/http-request.helper.js";
import { AuthErrorCode } from "../../src/data/constants/auth.constant.js";
import { OrganisationalUnitType } from "../../src/data/constants/organisational-unit.constant.js";
import { OrganisationalUnitErrorCode } from "../../src/data/constants/organisational-unit-error.constant.js";
import type { OrganisationalUnitSummaryDto } from "../../src/lib/types/organisational-unit/organisational-unit.type.js";
import type { ErrorResponseBody } from "../../src/lib/types/http/http.type.js";

type UnitResponse = { organisational_unit: OrganisationalUnitSummaryDto };
type UnitListResponse = { organisational_units: OrganisationalUnitSummaryDto[] };

async function withServer(run: (server: AuthTestServer) => Promise<void>): Promise<void> {
  const server = await startAuthTestServer();
  try {
    await run(server);
  } finally {
    await server.close();
  }
}

async function createUnit(server: AuthTestServer, body: Record<string, unknown>): Promise<OrganisationalUnitSummaryDto> {
  const response = await sendJson(server.baseUrl, HttpMethod.POST, "/organisational-units", TestIdentity.ORGANISATION_MANAGER, body);
  assert.equal(response.status, 201);
  return (await readJson<UnitResponse>(response)).organisational_unit;
}

async function createEngineering(server: AuthTestServer): Promise<{ faculty: OrganisationalUnitSummaryDto; department: OrganisationalUnitSummaryDto }> {
  const faculty = await createUnit(server, { code: "foe", name: "Faculty of Engineering", unit_type: OrganisationalUnitType.FACULTY });
  const department = await createUnit(server, {
    code: "CSE",
    name: "Department of Computer Science & Engineering",
    unit_type: OrganisationalUnitType.DEPARTMENT,
    parent_id: faculty.id,
    description: "Computing",
  });
  return { faculty, department };
}

test("organisational unit routes require authentication", async () => {
  await withServer(async (server) => {
    const response = await sendJson(server.baseUrl, HttpMethod.GET, "/organisational-units", null);
    assert.equal(response.status, 401);
    assert.equal((await readJson<ErrorResponseBody>(response)).code, AuthErrorCode.AUTHENTICATION_REQUIRED);
  });
});

test("writes require organisation:manage while any signed-in user may read", async () => {
  await withServer(async (server) => {
    const denied = await sendJson(server.baseUrl, HttpMethod.POST, "/organisational-units", TestIdentity.USER_MANAGER, {
      code: "FOE",
      name: "Faculty of Engineering",
      unit_type: OrganisationalUnitType.FACULTY,
    });
    assert.equal(denied.status, 403);
    assert.equal((await readJson<ErrorResponseBody>(denied)).code, AuthErrorCode.PERMISSION_DENIED);

    const { department } = await createEngineering(server);
    const read = await sendJson(server.baseUrl, HttpMethod.GET, `/organisational-units/${department.id}`, TestIdentity.TASK_CREATOR);
    assert.equal(read.status, 200);
    assert.equal((await readJson<UnitResponse>(read)).organisational_unit.code, "CSE");
  });
});

test("an organisation manager creates, filters, updates, archives and deletes units", async () => {
  await withServer(async (server) => {
    const { faculty, department } = await createEngineering(server);
    assert.equal(faculty.code, "FOE");
    assert.deepEqual(department.parent, {
      id: faculty.id,
      code: "FOE",
      name: "Faculty of Engineering",
      unit_type: OrganisationalUnitType.FACULTY,
      is_archived: false,
    });
    assert.equal(department.member_count, 0);

    const roots = await readJson<UnitListResponse>(
      await sendJson(server.baseUrl, HttpMethod.GET, "/organisational-units?root_only=true", TestIdentity.TASK_CREATOR),
    );
    assert.deepEqual(
      roots.organisational_units.map((unit) => unit.code),
      ["FOE"],
    );
    const children = await readJson<UnitListResponse>(
      await sendJson(server.baseUrl, HttpMethod.GET, `/organisational-units?parent_id=${faculty.id}`, TestIdentity.TASK_CREATOR),
    );
    assert.deepEqual(
      children.organisational_units.map((unit) => unit.code),
      ["CSE"],
    );

    const patched = await sendJson(server.baseUrl, HttpMethod.PATCH, `/organisational-units/${department.id}`, TestIdentity.ORGANISATION_MANAGER, {
      name: "Department of Computer Science and Engineering",
      description: null,
    });
    assert.equal(patched.status, 200);
    const patchedUnit = (await readJson<UnitResponse>(patched)).organisational_unit;
    assert.equal(patchedUnit.name, "Department of Computer Science and Engineering");
    assert.equal(patchedUnit.description, null);

    const blocked = await sendJson(server.baseUrl, HttpMethod.POST, `/organisational-units/${faculty.id}/archive`, TestIdentity.ORGANISATION_MANAGER);
    assert.equal(blocked.status, 409);
    const blockedBody = await readJson<ErrorResponseBody>(blocked);
    assert.equal(blockedBody.code, OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_HAS_ACTIVE_CHILDREN);
    assert.deepEqual(blockedBody.details, { active_child_count: 1 });

    const archived = await sendJson(server.baseUrl, HttpMethod.POST, `/organisational-units/${department.id}/archive`, TestIdentity.ORGANISATION_MANAGER);
    assert.equal((await readJson<UnitResponse>(archived)).organisational_unit.is_archived, true);
    const activeOnly = await readJson<UnitListResponse>(
      await sendJson(server.baseUrl, HttpMethod.GET, "/organisational-units", TestIdentity.TASK_CREATOR),
    );
    assert.deepEqual(
      activeOnly.organisational_units.map((unit) => unit.code),
      ["FOE"],
    );
    const restored = await sendJson(server.baseUrl, HttpMethod.POST, `/organisational-units/${department.id}/restore`, TestIdentity.ORGANISATION_MANAGER);
    assert.equal((await readJson<UnitResponse>(restored)).organisational_unit.is_archived, false);

    const deleted = await sendJson(server.baseUrl, HttpMethod.DELETE, `/organisational-units/${department.id}`, TestIdentity.ORGANISATION_MANAGER);
    assert.equal(deleted.status, 204);
    const missing = await sendJson(server.baseUrl, HttpMethod.GET, `/organisational-units/${department.id}`, TestIdentity.TASK_CREATOR);
    assert.equal(missing.status, 404);
    assert.equal((await readJson<ErrorResponseBody>(missing)).code, OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_NOT_FOUND);
  });
});

test("invalid input is rejected with 400 or 409 and a precise code", async () => {
  await withServer(async (server) => {
    const { faculty } = await createEngineering(server);
    const manager = TestIdentity.ORGANISATION_MANAGER;
    const base = server.baseUrl;

    for (const [path, body] of [
      ["/organisational-units", { code: "X", name: "X", unit_type: "school" }],
      ["/organisational-units", { code: "X", name: "X", unit_type: OrganisationalUnitType.FACULTY, parent_id: "not-a-uuid" }],
      ["/organisational-units", { name: "X", unit_type: OrganisationalUnitType.FACULTY }],
    ] as const) {
      assert.equal((await sendJson(base, HttpMethod.POST, path, manager, body)).status, 400, JSON.stringify(body));
    }

    const orphan = await sendJson(base, HttpMethod.POST, "/organisational-units", manager, {
      code: "CE",
      name: "Department of Civil Engineering",
      unit_type: OrganisationalUnitType.DEPARTMENT,
    });
    assert.equal(orphan.status, 400);
    assert.equal((await readJson<ErrorResponseBody>(orphan)).code, OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_PARENT_INVALID);

    const duplicate = await sendJson(base, HttpMethod.POST, "/organisational-units", manager, {
      code: "FOE",
      name: "Another Faculty",
      unit_type: OrganisationalUnitType.FACULTY,
    });
    assert.equal(duplicate.status, 409);
    assert.equal((await readJson<ErrorResponseBody>(duplicate)).code, OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_CODE_TAKEN);

    assert.equal((await sendJson(base, HttpMethod.GET, "/organisational-units?include_archived=yes", manager)).status, 400);
    assert.equal((await sendJson(base, HttpMethod.GET, `/organisational-units?root_only=true&parent_id=${faculty.id}`, manager)).status, 400);
    assert.equal((await sendJson(base, HttpMethod.GET, "/organisational-units/not-a-uuid", manager)).status, 400);
  });
});
