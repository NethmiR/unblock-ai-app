import test from "node:test";
import assert from "node:assert/strict";
import { SelectionController } from "../../src/controllers/selection.controller.js";
import { SelectionDecisionKind, SELECTION_FIELD_LIMIT, SelectionMessageRole } from "../../src/data/constants/selection.constant.js";
import { SelectionErrorCode } from "../../src/data/constants/selection-error.constant.js";
import { createTestControllers, startTestServer, TEST_USERS, TestIdentity, type TestServer } from "../helpers/test-server.helper.js";
import { HttpMethod, readJson, sendJson } from "../helpers/http-request.helper.js";
import { createSelectionTestbed, IT_LEAVE_ID, selectorDecision, type SelectionTestbed } from "../helpers/selection-testbed.helper.js";
import type { ErrorResponseBody } from "../../src/lib/types/http/http.type.js";
import type { SelectionCatalogueDto, SelectionSessionDto } from "../../src/lib/types/selection/selection-dto.type.js";

const OWNER = TestIdentity.TASK_CREATOR;
const STRANGER = TestIdentity.ADMINISTRATOR;

async function withServer(run: (server: TestServer, bed: SelectionTestbed) => Promise<void>): Promise<void> {
  const bed = await createSelectionTestbed({
    fullNameOf: (userId) => (userId === TEST_USERS[OWNER].id ? "Kavindu Jayawardena" : "Hasitha Dissanayake"),
  });
  const server = await startTestServer(createTestControllers({ selectionController: new SelectionController({ selectionService: bed.service }) }));
  try {
    await run(server, bed);
  } finally {
    await server.close();
  }
}

test("POST /selection/sessions starts an owned conversation with a match card", async () => {
  await withServer(async (server, bed) => {
    bed.selector.enqueue(selectorDecision({ matched_fact_ids: ["P2"] }));

    const response = await sendJson(server.baseUrl, HttpMethod.POST, "/selection/sessions", OWNER, { message: "I want overseas leave" });

    assert.equal(response.status, 201);
    const body = await readJson<SelectionSessionDto>(response);
    const reply = body.messages[1];
    assert.equal(body.messages[0]?.role, SelectionMessageRole.REQUESTER);
    assert.ok(reply && reply.role === SelectionMessageRole.ASSISTANT);
    assert.equal(reply.decision, SelectionDecisionKind.MATCHED);
    assert.equal(reply.match?.overview.workflow_template_id, IT_LEAVE_ID);
    assert.deepEqual(reply.match?.matched_facts.map((fact) => fact.unit.code), ["IT"]);
    assert.equal(typeof body.expires_at, "string");
  });
});

test("another user gets 404 for the session", async () => {
  await withServer(async (server) => {
    const created = await readJson<SelectionSessionDto>(
      await sendJson(server.baseUrl, HttpMethod.POST, "/selection/sessions", OWNER, { message: "overseas leave" }),
    );

    const read = await sendJson(server.baseUrl, HttpMethod.GET, `/selection/sessions/${created.id}`, STRANGER);
    const message = await sendJson(server.baseUrl, HttpMethod.POST, `/selection/sessions/${created.id}/messages`, STRANGER, { message: "hi" });

    assert.equal(read.status, 404);
    assert.equal((await readJson<ErrorResponseBody>(read)).code, SelectionErrorCode.SELECTION_SESSION_NOT_FOUND);
    assert.equal(message.status, 404);
    assert.equal((await sendJson(server.baseUrl, HttpMethod.GET, `/selection/sessions/${created.id}`, OWNER)).status, 200);
  });
});

test("an expired session returns 404", async () => {
  await withServer(async (server, bed) => {
    const created = await readJson<SelectionSessionDto>(
      await sendJson(server.baseUrl, HttpMethod.POST, "/selection/sessions", OWNER, { message: "overseas leave" }),
    );
    bed.sessionModel.now = () => new Date(Date.now() + 48 * 60 * 60 * 1000);

    assert.equal((await sendJson(server.baseUrl, HttpMethod.GET, `/selection/sessions/${created.id}`, OWNER)).status, 404);
  });
});

test("GET /selection/catalogue lists only the templates the requester is eligible for", async () => {
  await withServer(async (server) => {
    const response = await sendJson(server.baseUrl, HttpMethod.GET, "/selection/catalogue", OWNER);

    assert.equal(response.status, 200);
    const body = await readJson<SelectionCatalogueDto>(response);
    assert.deepEqual(body.workflow_templates.map((overview) => overview.workflow_template_id), [IT_LEAVE_ID]);
  });
});

test("messages longer than the limit are rejected", async () => {
  await withServer(async (server) => {
    const tooLong = "x".repeat(SELECTION_FIELD_LIMIT.MESSAGE_MAX_LENGTH + 1);

    const response = await sendJson(server.baseUrl, HttpMethod.POST, "/selection/sessions", OWNER, { message: tooLong });
    const empty = await sendJson(server.baseUrl, HttpMethod.POST, "/selection/sessions", OWNER, { message: "  " });

    assert.equal(response.status, 400);
    assert.equal(empty.status, 400);
  });
});

test("DELETE /selection/sessions/:id discards the conversation", async () => {
  await withServer(async (server) => {
    const created = await readJson<SelectionSessionDto>(
      await sendJson(server.baseUrl, HttpMethod.POST, "/selection/sessions", OWNER, { message: "overseas leave" }),
    );

    assert.equal((await sendJson(server.baseUrl, HttpMethod.DELETE, `/selection/sessions/${created.id}`, STRANGER)).status, 404);
    assert.equal((await sendJson(server.baseUrl, HttpMethod.DELETE, `/selection/sessions/${created.id}`, OWNER)).status, 204);
    assert.equal((await sendJson(server.baseUrl, HttpMethod.GET, `/selection/sessions/${created.id}`, OWNER)).status, 404);
  });
});

test("choose requires a UUID", async () => {
  await withServer(async (server) => {
    const created = await readJson<SelectionSessionDto>(
      await sendJson(server.baseUrl, HttpMethod.POST, "/selection/sessions", OWNER, { message: "overseas leave" }),
    );

    const response = await sendJson(server.baseUrl, HttpMethod.POST, `/selection/sessions/${created.id}/choose`, OWNER, { workflow_template_id: "nope" });

    assert.equal(response.status, 400);
  });
});
