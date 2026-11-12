import test from "node:test";
import assert from "node:assert/strict";
import { SelectionController } from "../../src/controllers/selection.controller.js";
import { ConflictError } from "../../src/errors/conflict.error.js";
import {
  authHeaderFor,
  TestIdentity,
  createTestControllers,
  startTestServer,
  type TestServer,
} from "../helpers/test-server.helper.js";
import type { SelectionService } from "../../src/services/selection.service.js";
import type { TaskService } from "../../src/services/task.service.js";
import type { SelectionResponseDto } from "../../src/lib/types/selection/session.type.js";
import type { PublishedWorkflowDefinition } from "../../src/lib/types/workflow-template/workflow-template.type.js";
import { LEAVE_WORKFLOW_TEMPLATE_ID } from "../helpers/workflow-template.helper.js";
import { loadExpectedFixture } from "../helpers/fixture.helper.js";

interface FakeSelectionServiceOptions {
  startResult?: SelectionResponseDto;
  answerResult?: SelectionResponseDto;
  chooseResult?: { session_id: string; decision: string; workflow_template_id: string };
  matchedWorkflowTemplate?: PublishedWorkflowDefinition;
  matchedWorkflowTemplateError?: Error;
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
    choose(sessionId: string, workflowTemplateId: string) {
      calls.choose.push({ sessionId, workflowTemplateId });
      return Promise.resolve(options.chooseResult);
    },
    getMatchedWorkflowTemplate() {
      if (options.matchedWorkflowTemplateError) return Promise.reject(options.matchedWorkflowTemplateError);
      return Promise.resolve(options.matchedWorkflowTemplate);
    },
  } as unknown as SelectionService & { calls: { start: unknown[]; answer: unknown[]; choose: unknown[] } };
}

async function buildServer(selectionService: SelectionService): Promise<TestServer> {
  const controllers = createTestControllers({ selectionController: new SelectionController({ selectionService }) });

  return startTestServer(controllers);
}

test("POST /api/selection/sessions rejects an empty query", async () => {
  const server = await buildServer(fakeSelectionService());
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaderFor(TestIdentity.TASK_CREATOR) },
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
      workflow_template_id: LEAVE_WORKFLOW_TEMPLATE_ID,
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
      headers: { "Content-Type": "application/json", ...authHeaderFor(TestIdentity.TASK_CREATOR) },
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
      headers: { "Content-Type": "application/json", ...authHeaderFor(TestIdentity.TASK_CREATOR) },
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
      workflow_template_id: LEAVE_WORKFLOW_TEMPLATE_ID,
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
      headers: { "Content-Type": "application/json", ...authHeaderFor(TestIdentity.TASK_CREATOR) },
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

test("POST /api/selection/sessions/:id/choose rejects a missing workflow_template_id", async () => {
  const server = await buildServer(fakeSelectionService());
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions/s1/choose`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaderFor(TestIdentity.TASK_CREATOR) },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("POST /api/selection/sessions/:id/choose rejects a workflow_template_id that is not a UUID", async () => {
  const selectionService = fakeSelectionService();
  const server = await buildServer(selectionService);
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions/s1/choose`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaderFor(TestIdentity.TASK_CREATOR) },
      body: JSON.stringify({ workflow_template_id: "wf_1" }),
    });
    assert.equal(res.status, 400);
    assert.equal(selectionService.calls.choose.length, 0);
  } finally {
    await server.close();
  }
});

test("POST /api/selection/sessions/:id/choose forwards to the service", async () => {
  const selectionService = fakeSelectionService({
    chooseResult: { session_id: "s1", decision: "matched", workflow_template_id: LEAVE_WORKFLOW_TEMPLATE_ID },
  });
  const server = await buildServer(selectionService);
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions/s1/choose`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaderFor(TestIdentity.TASK_CREATOR) },
      body: JSON.stringify({ workflow_template_id: LEAVE_WORKFLOW_TEMPLATE_ID }),
    });
    assert.equal(res.status, 200);
    assert.equal(
      (selectionService.calls.choose[0] as { workflowTemplateId: string }).workflowTemplateId,
      LEAVE_WORKFLOW_TEMPLATE_ID,
    );
  } finally {
    await server.close();
  }
});

test("GET /api/selection/sessions/:id/workflow-template returns 409 before a match", async () => {
  const selectionService = fakeSelectionService({
    matchedWorkflowTemplateError: new ConflictError("This session has not matched a workflow template yet"),
  });
  const server = await buildServer(selectionService);
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions/s1/workflow-template`, {
      headers: authHeaderFor(TestIdentity.TASK_CREATOR),
    });
    assert.equal(res.status, 409);
  } finally {
    await server.close();
  }
});

test("GET /api/selection/sessions/:id/workflow-template returns the published version and definition", async () => {
  const definition = loadExpectedFixture("it_faculty_overseas_leave.json");
  const selectionService = fakeSelectionService({ matchedWorkflowTemplate: { version: 3, definition } });
  const server = await buildServer(selectionService);
  try {
    const res = await fetch(`${server.baseUrl}/api/selection/sessions/s1/workflow-template`, {
      headers: authHeaderFor(TestIdentity.TASK_CREATOR),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { workflow_template_version: number; definition: { title: string } };
    assert.equal(body.workflow_template_version, 3);
    assert.equal(body.definition.title, definition.title);
  } finally {
    await server.close();
  }
});
