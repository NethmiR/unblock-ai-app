import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowController } from "../../src/controllers/workflow.controller.js";
import { DraftController } from "../../src/controllers/draft.controller.js";
import { SelectionController } from "../../src/controllers/selection.controller.js";
import { TaskController } from "../../src/controllers/task.controller.js";
import { HealthController } from "../../src/controllers/health.controller.js";
import { ConflictError } from "../../src/errors/conflict.error.js";
import { portalAuthHeader, startTestServer, type TestServer } from "../helpers/test-server.helper.js";
import type { ExtractionService } from "../../src/services/extraction.service.js";
import type { WorkflowService } from "../../src/services/workflow.service.js";
import type { DraftService } from "../../src/services/draft.service.js";
import type { SelectionService } from "../../src/services/selection.service.js";
import type { TaskService } from "../../src/services/task.service.js";
import type { SelectionResponseDto } from "../../src/lib/types/selection/session.type.js";
import type { WorkflowDefinition } from "../../src/lib/types/workflow/workflow.type.js";
import type { ApprovalController } from "../../src/controllers/approval.controller.js";
import type { AuthController } from "../../src/controllers/auth.controller.js";
import type { ApiControllers } from "../../src/routes/index.route.js";

interface FakeSelectionServiceOptions {
  startResult?: SelectionResponseDto;
  answerResult?: SelectionResponseDto;
  chooseResult?: { session_id: string; decision: string; workflow_id: string };
  matchedWorkflow?: WorkflowDefinition;
  matchedWorkflowError?: Error;
}

function fakeSelectionService(options: FakeSelectionServiceOptions = {}): SelectionService & {
  calls: { start: unknown[]; answer: unknown[]; choose: unknown[] };
} {
  const calls = { start: [] as unknown[], answer: [] as unknown[], choose: [] as unknown[] };
  return {
    calls,
    start(query: string, opts: unknown) {
      calls.start.push({ query, opts });
      return Promise.resolve(options.startResult);
    },
    answer(sessionId: string, answer: string) {
      calls.answer.push({ sessionId, answer });
      return Promise.resolve(options.answerResult);
    },
    choose(sessionId: string, workflowId: string) {
      calls.choose.push({ sessionId, workflowId });
      return Promise.resolve(options.chooseResult);
    },
    getMatchedWorkflow() {
      if (options.matchedWorkflowError) return Promise.reject(options.matchedWorkflowError);
      return Promise.resolve(options.matchedWorkflow);
    },
  } as unknown as SelectionService & { calls: { start: unknown[]; answer: unknown[]; choose: unknown[] } };
}

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

test("POST /api/selection/sessions rejects an empty query", async () => {
  const server = await buildServer(fakeSelectionService());
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...portalAuthHeader() },
      body: JSON.stringify({ query: "" }),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("POST /api/selection/sessions starts a session and returns the decision", async () => {
  const selectionService = fakeSelectionService({
    startResult: {
      session_id: "s1",
      decision: "matched",
      workflow_id: "wf_1",
      confidence: "high",
      question: null,
      options: [],
      candidates: [],
    },
  });
  const server = await buildServer(selectionService);
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...portalAuthHeader() },
      body: JSON.stringify({ query: "I want to apply for overseas leave" }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { decision: string };
    assert.equal(body.decision, "matched");
    assert.equal(selectionService.calls.start.length, 1);
    assert.equal(
      (selectionService.calls.start[0] as { query: string }).query,
      "I want to apply for overseas leave",
    );
  } finally {
    await server.close();
  }
});

test("POST /api/selection/sessions/:id/answer rejects an empty answer", async () => {
  const server = await buildServer(fakeSelectionService());
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions/s1/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...portalAuthHeader() },
      body: JSON.stringify({ answer: "" }),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("POST /api/selection/sessions/:id/answer forwards to the service", async () => {
  const selectionService = fakeSelectionService({
    answerResult: {
      session_id: "s1",
      decision: "matched",
      workflow_id: "wf_1",
      confidence: "high",
      question: null,
      options: [],
      candidates: [],
    },
  });
  const server = await buildServer(selectionService);
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions/s1/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...portalAuthHeader() },
      body: JSON.stringify({ answer: "Information Technology" }),
    });
    assert.equal(res.status, 200);
    assert.equal((selectionService.calls.answer[0] as { sessionId: string }).sessionId, "s1");
    assert.equal(
      (selectionService.calls.answer[0] as { answer: string }).answer,
      "Information Technology",
    );
  } finally {
    await server.close();
  }
});

test("POST /api/selection/sessions/:id/choose rejects a missing workflow_id", async () => {
  const server = await buildServer(fakeSelectionService());
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions/s1/choose`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...portalAuthHeader() },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("POST /api/selection/sessions/:id/choose forwards to the service", async () => {
  const selectionService = fakeSelectionService({
    chooseResult: { session_id: "s1", decision: "matched", workflow_id: "wf_1" },
  });
  const server = await buildServer(selectionService);
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions/s1/choose`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...portalAuthHeader() },
      body: JSON.stringify({ workflow_id: "wf_1" }),
    });
    assert.equal(res.status, 200);
    assert.equal((selectionService.calls.choose[0] as { workflowId: string }).workflowId, "wf_1");
  } finally {
    await server.close();
  }
});

test("GET /api/selection/sessions/:id/workflow returns 409 before a match", async () => {
  const selectionService = fakeSelectionService({
    matchedWorkflowError: new ConflictError("This session has not matched a workflow yet"),
  });
  const server = await buildServer(selectionService);
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions/s1/workflow`, {
      headers: portalAuthHeader(),
    });
    assert.equal(res.status, 409);
  } finally {
    await server.close();
  }
});

test("GET /api/selection/sessions/:id/workflow returns the matched workflow", async () => {
  const matchedWorkflow = { workflow_id: "wf_1", title: "Test" } as unknown as WorkflowDefinition;
  const selectionService = fakeSelectionService({ matchedWorkflow });
  const server = await buildServer(selectionService);
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions/s1/workflow`, {
      headers: portalAuthHeader(),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { workflow_id: string };
    assert.equal(body.workflow_id, "wf_1");
  } finally {
    await server.close();
  }
});
