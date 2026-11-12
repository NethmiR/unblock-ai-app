import test from "node:test";
import assert from "node:assert/strict";
import { startAuthTestServer, type AuthTestServer } from "../helpers/auth-test-server.helper.js";
import { TestIdentity } from "../helpers/test-server.helper.js";
import { HttpMethod, readJson, sendJson } from "../helpers/http-request.helper.js";
import { AuthErrorCode } from "../../src/data/constants/auth.constant.js";
import { DesignationCategory } from "../../src/data/constants/designation.constant.js";
import { DesignationErrorCode } from "../../src/data/constants/designation-error.constant.js";
import { OrganisationalUnitType } from "../../src/data/constants/organisational-unit.constant.js";
import type { DesignationSummaryDto } from "../../src/lib/types/designation/designation.type.js";
import type { ErrorResponseBody } from "../../src/lib/types/http/http.type.js";

type DesignationResponse = { designation: DesignationSummaryDto };

const HEAD_OF_DEPARTMENT = {
  code: "head_of_department",
  title: "Head of Department",
  category: DesignationCategory.LEADERSHIP,
  applicable_unit_types: [OrganisationalUnitType.DEPARTMENT],
  single_holder_per_unit: true,
  display_order: 70,
};

async function withServer(run: (server: AuthTestServer) => Promise<void>): Promise<void> {
  const server = await startAuthTestServer();
  try {
    await run(server);
  } finally {
    await server.close();
  }
}

test("designation writes require organisation:manage; reads need only a session", async () => {
  await withServer(async (server) => {
    assert.equal((await sendJson(server.baseUrl, HttpMethod.GET, "/designations", null)).status, 401);

    const denied = await sendJson(server.baseUrl, HttpMethod.POST, "/designations", TestIdentity.USER_MANAGER, HEAD_OF_DEPARTMENT);
    assert.equal(denied.status, 403);
    assert.equal((await readJson<ErrorResponseBody>(denied)).code, AuthErrorCode.PERMISSION_DENIED);

    const listed = await sendJson(server.baseUrl, HttpMethod.GET, "/designations", TestIdentity.TASK_CREATOR);
    assert.deepEqual(await readJson<{ designations: DesignationSummaryDto[] }>(listed), { designations: [] });
  });
});

test("an organisation manager creates, updates, archives and deletes a designation", async () => {
  await withServer(async (server) => {
    const manager = TestIdentity.ORGANISATION_MANAGER;
    const created = await sendJson(server.baseUrl, HttpMethod.POST, "/designations", manager, HEAD_OF_DEPARTMENT);
    assert.equal(created.status, 201);
    const designation = (await readJson<DesignationResponse>(created)).designation;
    assert.equal(designation.code, "head_of_department");
    assert.deepEqual(designation.applicable_unit_types, [OrganisationalUnitType.DEPARTMENT]);
    assert.equal(designation.single_holder_per_unit, true);
    assert.equal(designation.holder_count, 0);

    const patched = await sendJson(server.baseUrl, HttpMethod.PATCH, `/designations/${designation.id}`, manager, {
      title: "Head of the Department",
      applicable_unit_types: [OrganisationalUnitType.DEPARTMENT, OrganisationalUnitType.DIVISION],
      display_order: 75,
    });
    assert.equal(patched.status, 200);
    const patchedDesignation = (await readJson<DesignationResponse>(patched)).designation;
    assert.equal(patchedDesignation.title, "Head of the Department");
    assert.deepEqual(patchedDesignation.applicable_unit_types, [OrganisationalUnitType.DEPARTMENT, OrganisationalUnitType.DIVISION]);
    assert.equal(patchedDesignation.display_order, 75);

    const archived = await sendJson(server.baseUrl, HttpMethod.POST, `/designations/${designation.id}/archive`, manager);
    assert.equal((await readJson<DesignationResponse>(archived)).designation.is_archived, true);
    const activeList = await readJson<{ designations: DesignationSummaryDto[] }>(
      await sendJson(server.baseUrl, HttpMethod.GET, "/designations", TestIdentity.TASK_CREATOR),
    );
    assert.equal(activeList.designations.length, 0);
    const fullList = await readJson<{ designations: DesignationSummaryDto[] }>(
      await sendJson(server.baseUrl, HttpMethod.GET, "/designations?include_archived=true", TestIdentity.TASK_CREATOR),
    );
    assert.equal(fullList.designations.length, 1);

    assert.equal((await sendJson(server.baseUrl, HttpMethod.DELETE, `/designations/${designation.id}`, manager)).status, 204);
    const missing = await sendJson(server.baseUrl, HttpMethod.GET, `/designations/${designation.id}`, TestIdentity.TASK_CREATOR);
    assert.equal(missing.status, 404);
    assert.equal((await readJson<ErrorResponseBody>(missing)).code, DesignationErrorCode.DESIGNATION_NOT_FOUND);
  });
});

test("malformed designation bodies are rejected with 400", async () => {
  await withServer(async (server) => {
    const manager = TestIdentity.ORGANISATION_MANAGER;
    for (const body of [
      { ...HEAD_OF_DEPARTMENT, category: "executive" },
      { ...HEAD_OF_DEPARTMENT, applicable_unit_types: ["school"] },
      { ...HEAD_OF_DEPARTMENT, applicable_unit_types: [] },
      { ...HEAD_OF_DEPARTMENT, single_holder_per_unit: "yes" },
      { ...HEAD_OF_DEPARTMENT, display_order: 1.5 },
      { ...HEAD_OF_DEPARTMENT, code: "Head-Of-Department" },
    ]) {
      assert.equal((await sendJson(server.baseUrl, HttpMethod.POST, "/designations", manager, body)).status, 400, JSON.stringify(body));
    }
  });
});
