import test from "node:test";
import assert from "node:assert/strict";
import { SelectionController } from "../../src/controllers/selection.controller.js";
import { ValidationError } from "../../src/errors/validation.error.js";
import { DatabaseError } from "../../src/errors/database.error.js";
import {
  authHeaderFor,
  TestIdentity,
  createTestControllers,
  startTestServer,
  type TestServer,
} from "../helpers/test-server.helper.js";
import type { SelectionService } from "../../src/services/selection.service.js";
import type { TaskService } from "../../src/services/task.service.js";

async function buildServer(selectionService: SelectionService): Promise<TestServer> {
  const controllers = createTestControllers({ selectionController: new SelectionController({ selectionService }) });

  return startTestServer(controllers);
}

test("a BaseError subclass responds with its own statusCode and toJSON body", async () => {
  const selectionService = {
    start() {
      throw new ValidationError("bad selection request");
    },
  } as unknown as SelectionService;
  const server = await buildServer(selectionService);
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaderFor(TestIdentity.TASK_CREATOR) },
      body: JSON.stringify({ message: "anything" }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string; code: string; details: unknown };
    assert.equal(body.error, "bad selection request");
    assert.equal(body.code, "VALIDATION_ERROR");
    assert.equal(body.details, null);
  } finally {
    await server.close();
  }
});

test("an unknown error responds 500 with a generic body and does not leak the original message", async () => {
  const selectionService = {
    start() {
      throw new Error("leaked internal detail: connection string xyz");
    },
  } as unknown as SelectionService;
  const server = await buildServer(selectionService);
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaderFor(TestIdentity.TASK_CREATOR) },
      body: JSON.stringify({ message: "anything" }),
    });
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: string; code: string; details: unknown };
    assert.equal(body.error, "Internal server error");
    assert.equal(body.code, "INTERNAL_ERROR");
    assert.equal(body.details, null);
    assert.ok(!body.error.includes("connection string"));
  } finally {
    await server.close();
  }
});

test("a BaseError with a cause logs the cause chain without exposing it in the response", async (t) => {
  const selectionService = {
    start() {
      throw new DatabaseError("Postgres query failed", {
        cause: new Error("getaddrinfo ENOTFOUND db.example.test"),
      });
    },
  } as unknown as SelectionService;
  const warn = t.mock.method(console, "warn", () => {});
  const server = await buildServer(selectionService);
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaderFor(TestIdentity.TASK_CREATOR) },
      body: JSON.stringify({ message: "anything" }),
    });
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: string; code: string; details: unknown };
    assert.equal(body.code, "DATABASE_ERROR");
    assert.ok(!JSON.stringify(body).includes("ENOTFOUND"));

    const entries = warn.mock.calls.map((call) => JSON.parse(String(call.arguments[0])) as Record<string, unknown>);
    const entry = entries.find((e) => e.code === "DATABASE_ERROR");
    assert.equal(entry?.cause, "getaddrinfo ENOTFOUND db.example.test");
  } finally {
    await server.close();
  }
});

test("an unknown route responds 404 via the not-found middleware", async () => {
  const server = await buildServer({} as SelectionService);
  try {
    const res = await fetch(`${server.baseUrl}/api/does-not-exist`);
    assert.equal(res.status, 404);
  } finally {
    await server.close();
  }
});
