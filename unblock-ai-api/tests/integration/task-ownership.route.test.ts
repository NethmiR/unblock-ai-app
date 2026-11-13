import test from "node:test";
import assert from "node:assert/strict";
import { TaskController } from "../../src/controllers/task.controller.js";
import { TaskFormController } from "../../src/controllers/task-form.controller.js";
import { TaskService } from "../../src/services/task.service.js";
import { createRequireTaskOwnership } from "../../src/middlewares/require-task-ownership.middleware.js";
import { ConflictError } from "../../src/errors/conflict.error.js";
import {
  TEST_USERS,
  TestIdentity,
  authHeaderFor,
  createTestAuthentication,
  createTestControllers,
  startTestServer,
  type TestServer,
} from "../helpers/test-server.helper.js";
import type { ErrorResponseBody } from "../../src/lib/types/http/http.type.js";

const OWNED_TASK_ID = "64b64b64b64b64b64b64b641";
const HANDLER_REACHED = "handler reached";

const TASK_ROUTES: ReadonlyArray<{ method: string; path: string; body?: Record<string, unknown> }> = [
  { method: "GET", path: `/api/tasks/${OWNED_TASK_ID}` },
  { method: "GET", path: `/api/tasks/${OWNED_TASK_ID}/workflow-definition` },
  { method: "PUT", path: `/api/tasks/${OWNED_TASK_ID}/forms/entry_form__form/draft`, body: { values: {} } },
  { method: "POST", path: `/api/tasks/${OWNED_TASK_ID}/forms/entry_form__form/submit`, body: { values: {} } },
  { method: "POST", path: `/api/tasks/${OWNED_TASK_ID}/cancel` },
  { method: "GET", path: `/api/tasks/${OWNED_TASK_ID}/transcript` },
  { method: "DELETE", path: `/api/tasks/${OWNED_TASK_ID}` },
];

function handlerReached<T extends object>(): T {
  return new Proxy({}, { get: () => () => Promise.reject(new ConflictError(HANDLER_REACHED)) }) as T;
}

const SERIALIZATION = { documentsEnabled: true, isDeletable: TaskService.isDeletable };

async function buildServer(): Promise<TestServer> {
  const owners = new Map([[OWNED_TASK_ID, TEST_USERS[TestIdentity.TASK_CREATOR].id]]);
  const controllers = createTestControllers({
    taskController: new TaskController({ taskService: handlerReached(), serialization: SERIALIZATION, transcriptService: handlerReached() }),
    taskFormController: new TaskFormController({ taskFormService: handlerReached(), serialization: SERIALIZATION }),
  });

  return startTestServer(controllers, {
    authenticationService: createTestAuthentication().authenticationService,
    routeGuards: {
      requireTaskOwnership: createRequireTaskOwnership({
        taskService: { isOwnedBy: async (taskId, userId) => owners.get(String(taskId)) === userId },
      }),
    },
  });
}

function send(
  baseUrl: string,
  route: { method: string; path: string; body?: Record<string, unknown> },
  identity: TestIdentity,
): Promise<Response> {
  return fetch(`${baseUrl}${route.path}`, {
    method: route.method,
    headers: { "Content-Type": "application/json", ...authHeaderFor(identity) },
    body: route.method === "GET" || route.method === "DELETE" ? undefined : JSON.stringify(route.body ?? {}),
  });
}

test("every /tasks/:id route returns 404 to a task creator who does not own the task", async () => {
  const server = await buildServer();
  try {
    for (const route of TASK_ROUTES) {
      const res = await send(server.baseUrl, route, TestIdentity.ADMINISTRATOR);
      assert.equal(res.status, 404, `${route.method} ${route.path}`);
      assert.equal(((await res.json()) as ErrorResponseBody).error, `Task '${OWNED_TASK_ID}' not found`);
    }
  } finally {
    await server.close();
  }
});

test("every /tasks/:id route lets the owner through to the handler", async () => {
  const server = await buildServer();
  try {
    for (const route of TASK_ROUTES) {
      const res = await send(server.baseUrl, route, TestIdentity.TASK_CREATOR);
      assert.equal(res.status, 409, `${route.method} ${route.path}`);
      assert.equal(((await res.json()) as ErrorResponseBody).error, HANDLER_REACHED);
    }
  } finally {
    await server.close();
  }
});

test("a missing task and someone else's task are indistinguishable", async () => {
  const server = await buildServer();
  try {
    const missingId = "64b64b64b64b64b64b64b649";
    const missing = await send(server.baseUrl, { method: "GET", path: `/api/tasks/${missingId}` }, TestIdentity.TASK_CREATOR);
    const foreign = await send(server.baseUrl, { method: "GET", path: `/api/tasks/${OWNED_TASK_ID}` }, TestIdentity.ADMINISTRATOR);
    assert.equal(missing.status, 404);
    assert.equal(foreign.status, 404);
    assert.equal(((await missing.json()) as ErrorResponseBody).code, ((await foreign.json()) as ErrorResponseBody).code);
  } finally {
    await server.close();
  }
});
