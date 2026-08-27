import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowController } from "../../src/controllers/workflow.controller.js";
import { DraftController } from "../../src/controllers/draft.controller.js";
import { SelectionController } from "../../src/controllers/selection.controller.js";
import { TaskController } from "../../src/controllers/task.controller.js";
import { HealthController } from "../../src/controllers/health.controller.js";
import { ValidationError } from "../../src/errors/validation.error.js";
import { startTestServer, type TestServer } from "../helpers/test-server.helper.js";
import type { ExtractionService } from "../../src/services/extraction.service.js";
import type { WorkflowService } from "../../src/services/workflow.service.js";
import type { DraftService } from "../../src/services/draft.service.js";
import type { SelectionService } from "../../src/services/selection.service.js";
import type { TaskService } from "../../src/services/task.service.js";
import type { ApprovalController } from "../../src/controllers/approval.controller.js";
import type { AuthController } from "../../src/controllers/auth.controller.js";
import type { ApiControllers } from "../../src/routes/index.route.js";

async function buildServer(selectionService: SelectionService): Promise<TestServer> {
  const controllers: ApiControllers = {
    healthController: new HealthController(),
    workflowController: new WorkflowController({
      workflowService: {} as WorkflowService,
      extractionService: {} as ExtractionService,
      validationService: {} as never,
      draftService: {} as never,
    }),
    draftController: new DraftController({
      draftService: {} as DraftService,
      extractionService: {} as ExtractionService,
      workflowService: {} as WorkflowService,
    }),
    selectionController: new SelectionController({ selectionService }),
    taskController: new TaskController({ taskService: {} as TaskService }),
    approvalController: {} as ApprovalController,
    authController: {} as AuthController,
  };

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "anything" }),
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "anything" }),
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

test("an unknown route responds 404 via the not-found middleware", async () => {
  const server = await buildServer({} as SelectionService);
  try {
    const res = await fetch(`${server.baseUrl}/api/does-not-exist`);
    assert.equal(res.status, 404);
  } finally {
    await server.close();
  }
});
