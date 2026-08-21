import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowController } from "../../src/controllers/workflow.controller.js";
import { DraftController } from "../../src/controllers/draft.controller.js";
import { SelectionController } from "../../src/controllers/selection.controller.js";
import { TaskController } from "../../src/controllers/task.controller.js";
import { ApprovalController } from "../../src/controllers/approval.controller.js";
import { HealthController } from "../../src/controllers/health.controller.js";
import { NotFoundError } from "../../src/errors/not-found.error.js";
import { ValidationError } from "../../src/errors/validation.error.js";
import { startTestServer, type TestServer } from "../helpers/test-server.helper.js";
import type { ExtractionService } from "../../src/services/extraction.service.js";
import type { WorkflowService } from "../../src/services/workflow.service.js";
import type { DraftService } from "../../src/services/draft.service.js";
import type { SelectionService } from "../../src/services/selection.service.js";
import type { TaskService } from "../../src/services/task.service.js";
import type { ApprovalService } from "../../src/services/approval.service.js";
import type { ApiControllers } from "../../src/routes/index.route.js";
import type { ApproverViewDto, DecisionResultDto } from "../../src/lib/types/approval/approval.type.js";

function fakeApproverView(overrides: Partial<ApproverViewDto> = {}): ApproverViewDto {
  return {
    task_reference: "TASK-2026-00001",
    workflow_title: "IT Faculty Overseas Leave",
    step: { step_id: "advisor_review", name: "Advisor Review", instructions_to_approver: null, response_fields: [] },
    approver: { name: "Dr. Advisor", email: "advisor@example.com" },
    requester_answers: [],
    computed: [],
    prior_decisions: [],
    approvers: [],
    allowed_outcomes: ["approved", "rejected", "request_more_info"],
    outcomes: [
      { outcome: "approved", include_reason: false },
      { outcome: "rejected", include_reason: true },
      { outcome: "request_more_info", include_reason: true },
    ],
    already_decided: false,
    decided_outcome: null,
    decided_at: null,
    ...overrides,
  };
}

interface FakeApprovalServiceOptions {
  viewResult?: ApproverViewDto;
  viewError?: Error;
  decisionResult?: DecisionResultDto;
  decisionError?: Error;
}

function fakeApprovalService(options: FakeApprovalServiceOptions = {}): ApprovalService {
  return {
    getApproverView() {
      if (options.viewError) return Promise.reject(options.viewError);
      return Promise.resolve(options.viewResult ?? fakeApproverView());
    },
    submitDecision() {
      if (options.decisionError) return Promise.reject(options.decisionError);
      return Promise.resolve(
        options.decisionResult ?? {
          task_id: "64b64b64b64b64b64b64b64",
          step_id: "advisor_review",
          outcome: "approved",
          status: "in_progress",
          completed: false,
          terminated: false,
        },
      );
    },
  } as unknown as ApprovalService;
}

async function buildServer(approvalService: ApprovalService): Promise<TestServer> {
  const controllers: ApiControllers = {
    healthController: new HealthController(),
    workflowController: new WorkflowController({
      workflowService: {} as WorkflowService,
      extractionService: {} as ExtractionService,
      validationService: {} as never,
    }),
    draftController: new DraftController({
      draftService: {} as DraftService,
      extractionService: {} as ExtractionService,
      workflowService: {} as WorkflowService,
    }),
    selectionController: new SelectionController({ selectionService: {} as SelectionService }),
    taskController: new TaskController({ taskService: {} as TaskService }),
    approvalController: new ApprovalController({ approvalService }),
  };

  return startTestServer(controllers);
}

test("GET /api/approvals/garbage returns 404, not 500", async () => {
  const server = await buildServer(fakeApprovalService({ viewError: NotFoundError.of("Approval token", "garbage") }));
  try {
    const res = await fetch(`${server.baseUrl}/api/approvals/garbage`);
    assert.equal(res.status, 404);
  } finally {
    await server.close();
  }
});

test("GET /api/approvals/:token happy path returns 200 with the approver view", async () => {
  const server = await buildServer(fakeApprovalService());
  try {
    const res = await fetch(`${server.baseUrl}/api/approvals/some-token`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as ApproverViewDto;
    assert.equal(body.task_reference, "TASK-2026-00001");
  } finally {
    await server.close();
  }
});

test("POST /api/approvals/:token/decision with a bad outcome returns 400", async () => {
  const server = await buildServer(fakeApprovalService());
  try {
    const res = await fetch(`${server.baseUrl}/api/approvals/some-token/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome: "maybe" }),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("POST /api/approvals/:token/decision rejecting without a reason returns 400", async () => {
  const server = await buildServer(
    fakeApprovalService({ decisionError: new ValidationError("A reason is required for outcome 'rejected'") }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/api/approvals/some-token/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome: "rejected" }),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("POST /api/approvals/:token/decision happy path approve returns 200", async () => {
  const server = await buildServer(fakeApprovalService());
  try {
    const res = await fetch(`${server.baseUrl}/api/approvals/some-token/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome: "approved" }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as DecisionResultDto;
    assert.equal(body.outcome, "approved");
  } finally {
    await server.close();
  }
});
