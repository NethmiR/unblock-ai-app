import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowController } from "../../src/controllers/workflow.controller.js";
import { DraftController } from "../../src/controllers/draft.controller.js";
import { SelectionController } from "../../src/controllers/selection.controller.js";
import { TaskController } from "../../src/controllers/task.controller.js";
import { HealthController } from "../../src/controllers/health.controller.js";
import { DraftService } from "../../src/services/draft.service.js";
import { adminAuthHeader, startTestServer, type TestServer } from "../helpers/test-server.helper.js";
import { FakeDraftModel } from "../helpers/fake-model.helper.js";
import type { ExtractionService } from "../../src/services/extraction.service.js";
import type { WorkflowService } from "../../src/services/workflow.service.js";
import type { SelectionService } from "../../src/services/selection.service.js";
import type { TaskService } from "../../src/services/task.service.js";
import type { ApprovalController } from "../../src/controllers/approval.controller.js";
import type { AuthController } from "../../src/controllers/auth.controller.js";
import type { ApiControllers } from "../../src/routes/index.route.js";

async function buildServer(): Promise<TestServer> {
  const draftModel = new FakeDraftModel();
  const draftService = new DraftService({
    draftModel: draftModel as unknown as ConstructorParameters<typeof DraftService>[0]["draftModel"],
  });

  const controllers: ApiControllers = {
    healthController: new HealthController(),
    workflowController: new WorkflowController({
      workflowService: {} as WorkflowService,
      extractionService: {} as ExtractionService,
      validationService: {} as never,
      draftService: {} as never,
    }),
    draftController: new DraftController({
      draftService,
      extractionService: {} as ExtractionService,
      workflowService: {} as WorkflowService,
    }),
    selectionController: new SelectionController({ selectionService: {} as SelectionService }),
    taskController: new TaskController({ taskService: {} as TaskService }),
    approvalController: {} as ApprovalController,
    authController: {} as AuthController,
  };

  return startTestServer(controllers);
}

test("POST /api/drafts rejects an empty text body", async () => {
  const server = await buildServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminAuthHeader() },
      body: JSON.stringify({ text: "  " }),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("POST /api/drafts creates a draft and GET /api/drafts lists it", async () => {
  const server = await buildServer();
  try {
    const createRes = await fetch(`${server.baseUrl}/api/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminAuthHeader() },
      body: JSON.stringify({ text: "Staff must obtain approval before travelling abroad." }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as { id: string; status: string };
    assert.equal(created.status, "pending");
    assert.ok(created.id);

    const listRes = await fetch(`${server.baseUrl}/api/drafts`, { headers: adminAuthHeader() });
    assert.equal(listRes.status, 200);
    const list = (await listRes.json()) as Array<{ id: string }>;
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, created.id);
  } finally {
    await server.close();
  }
});

test("GET /api/drafts/:id returns 404 for an unknown draft", async () => {
  const server = await buildServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/drafts/64b64b64b64b64b64b64b64b`, {
      headers: adminAuthHeader(),
    });
    assert.equal(res.status, 404);
  } finally {
    await server.close();
  }
});
