import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowController } from "../../src/controllers/workflow.controller.js";
import { DraftController } from "../../src/controllers/draft.controller.js";
import { SelectionController } from "../../src/controllers/selection.controller.js";
import { TaskController } from "../../src/controllers/task.controller.js";
import { HealthController } from "../../src/controllers/health.controller.js";
import { ConflictError } from "../../src/errors/conflict.error.js";
import { ValidationError } from "../../src/errors/validation.error.js";
import { NotFoundError } from "../../src/errors/not-found.error.js";
import { TASK_STATUS, REQUIREMENT_STATUS } from "../../src/data/constants/status.constant.js";
import {
  adminAuthHeader,
  portalAuthHeader,
  startTestServer,
  TEST_PORTAL_ROW,
  type TestServer,
} from "../helpers/test-server.helper.js";
import type { ExtractionService } from "../../src/services/extraction.service.js";
import type { WorkflowService } from "../../src/services/workflow.service.js";
import type { DraftService } from "../../src/services/draft.service.js";
import type { SelectionService } from "../../src/services/selection.service.js";
import type { TaskService } from "../../src/services/task.service.js";
import type { ApprovalController } from "../../src/controllers/approval.controller.js";
import type { AuthController } from "../../src/controllers/auth.controller.js";
import type { ApiControllers } from "../../src/routes/index.route.js";
import type { TaskDocument, NextRequirementDto } from "../../src/lib/types/task/task.type.js";
import type { RenderedDocument } from "../../src/lib/types/document/document.type.js";

function fakeTask(overrides: Partial<TaskDocument> = {}): TaskDocument {
  return {
    _id: "64b64b64b64b64b64b64b64" as unknown as TaskDocument["_id"],
    reference: "TASK-2026-00001",
    session_id: "s1",
    created_by: "user-1",
    workflow_id: "wf_1",
    version: 1,
    status: TASK_STATUS.COLLECTING,
    requirements: [],
    values: {},
    steps: [],
    audit: [],
    completion_document: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

interface FakeTaskServiceOptions {
  createResult?: TaskDocument;
  createError?: Error;
  nextResult?: NextRequirementDto;
  setValueError?: Error;
  finalizeError?: Error;
  documentResult?: RenderedDocument;
  documentError?: Error;
  listResult?: TaskDocument[];
  onList?: (filters: { created_by?: string; session_id?: string; status?: string }) => void;
}

function fakeTaskService(options: FakeTaskServiceOptions = {}): TaskService {
  return {
    create() {
      if (options.createError) return Promise.reject(options.createError);
      return Promise.resolve(options.createResult ?? fakeTask());
    },
    get() {
      return Promise.resolve(fakeTask());
    },
    nextRequirement() {
      return Promise.resolve(options.nextResult ?? { requirement: null, complete: true });
    },
    setValue() {
      if (options.setValueError) return Promise.reject(options.setValueError);
      return Promise.resolve(fakeTask());
    },
    finalize() {
      if (options.finalizeError) return Promise.reject(options.finalizeError);
      return Promise.resolve(fakeTask({ status: TASK_STATUS.READY }));
    },
    cancel() {
      return Promise.resolve(fakeTask({ status: TASK_STATUS.CANCELLED }));
    },
    list(filters: { created_by?: string; session_id?: string; status?: string }) {
      options.onList?.(filters);
      return Promise.resolve(options.listResult ?? []);
    },
    getDocument() {
      if (options.documentError) return Promise.reject(options.documentError);
      return Promise.resolve(
        options.documentResult ?? {
          buffer: Buffer.from("%PDF-fake", "utf8"),
          filename: "TASK-2026-00001-record.pdf",
          contentType: "application/pdf",
          byteSize: 9,
          sha256: "fake-sha256",
        },
      );
    },
  } as unknown as TaskService;
}

async function buildServer(taskService: TaskService): Promise<TestServer> {
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
    selectionController: new SelectionController({ selectionService: {} as SelectionService }),
    taskController: new TaskController({ taskService }),
    approvalController: {} as ApprovalController,
    authController: {} as AuthController,
  };

  return startTestServer(controllers);
}

test("POST /api/tasks rejects a missing session_id", async () => {
  const server = await buildServer(fakeTaskService());
  try {
    const res = await fetch(`${server.baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...portalAuthHeader() },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("POST /api/tasks on an unmatched session returns 409", async () => {
  const server = await buildServer(
    fakeTaskService({ createError: new ConflictError("This session has not matched a workflow yet") }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...portalAuthHeader() },
      body: JSON.stringify({ session_id: "s1" }),
    });
    assert.equal(res.status, 409);
  } finally {
    await server.close();
  }
});

test("POST /api/tasks happy path returns 201 with id, reference, and status", async () => {
  const server = await buildServer(fakeTaskService({ createResult: fakeTask() }));
  try {
    const res = await fetch(`${server.baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...portalAuthHeader() },
      body: JSON.stringify({ session_id: "s1" }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { id: string; reference: string; status: string };
    assert.ok(body.id);
    assert.equal(body.reference, "TASK-2026-00001");
    assert.equal(body.status, "collecting");
  } finally {
    await server.close();
  }
});

test("GET /api/tasks as a portal user forces created_by to their own id, ignoring any client-supplied value", async () => {
  let receivedFilters: { created_by?: string; session_id?: string; status?: string } | undefined;
  const server = await buildServer(fakeTaskService({ onList: (filters) => (receivedFilters = filters) }));
  try {
    const res = await fetch(`${server.baseUrl}/api/tasks?created_by=someone-else`, {
      headers: portalAuthHeader(),
    });
    assert.equal(res.status, 200);
    assert.equal(receivedFilters?.created_by, TEST_PORTAL_ROW.id);
  } finally {
    await server.close();
  }
});

test("GET /api/tasks as an admin is not scoped to a single requester", async () => {
  let receivedFilters: { created_by?: string; session_id?: string; status?: string } | undefined;
  const server = await buildServer(fakeTaskService({ onList: (filters) => (receivedFilters = filters) }));
  try {
    const res = await fetch(`${server.baseUrl}/api/tasks`, { headers: adminAuthHeader() });
    assert.equal(res.status, 200);
    assert.equal(receivedFilters?.created_by, undefined);
  } finally {
    await server.close();
  }
});

test("GET /api/tasks/:id/next returns 200 with a requirement", async () => {
  const requirement = {
    key: "departure_date",
    source: "input" as const,
    ref: "departure_date",
    label: "Departure Date",
    description: null,
    type: "date" as const,
    required: true,
    validation: null,
    collection_hint: null,
    status: REQUIREMENT_STATUS.PENDING,
  };
  const server = await buildServer(fakeTaskService({ nextResult: { requirement, complete: false } }));
  try {
    const res = await fetch(`${server.baseUrl}/api/tasks/64b64b64b64b64b64b64b64/next`, {
      headers: portalAuthHeader(),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { requirement: { key: string } | null; complete: boolean };
    assert.equal(body.requirement?.key, "departure_date");
    assert.equal(body.complete, false);
  } finally {
    await server.close();
  }
});

test("POST /api/tasks/:id/values rejects a missing key", async () => {
  const server = await buildServer(fakeTaskService());
  try {
    const res = await fetch(`${server.baseUrl}/api/tasks/64b64b64b64b64b64b64b64/values`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...portalAuthHeader() },
      body: JSON.stringify({ value: "2026-09-01" }),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("POST /api/tasks/:id/finalize with unfilled requirements returns 400", async () => {
  const server = await buildServer(
    fakeTaskService({
      finalizeError: new ValidationError("Task is missing required values: departure_date"),
    }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/api/tasks/64b64b64b64b64b64b64b64/finalize`, {
      method: "POST",
      headers: portalAuthHeader(),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("PATCH /api/tasks/:id/status rejects a bad status", async () => {
  const server = await buildServer(fakeTaskService());
  try {
    const res = await fetch(`${server.baseUrl}/api/tasks/64b64b64b64b64b64b64b64/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...portalAuthHeader() },
      body: JSON.stringify({ status: "completed" }),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("GET /api/tasks/:id/document returns the PDF with the right headers", async () => {
  const server = await buildServer(fakeTaskService());
  try {
    const res = await fetch(`${server.baseUrl}/api/tasks/64b64b64b64b64b64b64b64/document`, {
      headers: portalAuthHeader(),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    assert.match(res.headers.get("content-disposition") ?? "", /attachment; filename="TASK-2026-00001-record\.pdf"/);
    const body = Buffer.from(await res.arrayBuffer());
    assert.match(body.toString("latin1"), /^%PDF-/);
  } finally {
    await server.close();
  }
});

test("GET /api/tasks/:id/document on a task not yet completed returns 409", async () => {
  const server = await buildServer(
    fakeTaskService({
      documentError: new ConflictError("A record is only issued once every step is approved"),
    }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/api/tasks/64b64b64b64b64b64b64b64/document`, {
      headers: portalAuthHeader(),
    });
    assert.equal(res.status, 409);
  } finally {
    await server.close();
  }
});

test("GET /api/tasks/:id/document for an unknown task returns 404", async () => {
  const server = await buildServer(
    fakeTaskService({ documentError: NotFoundError.of("Task", "64b64b64b64b64b64b64b64") }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/api/tasks/64b64b64b64b64b64b64b64/document`, {
      headers: portalAuthHeader(),
    });
    assert.equal(res.status, 404);
  } finally {
    await server.close();
  }
});

test("GET /api/tasks/:id/document with no token returns 401", async () => {
  const server = await buildServer(fakeTaskService());
  try {
    const res = await fetch(`${server.baseUrl}/api/tasks/64b64b64b64b64b64b64b64/document`);
    assert.equal(res.status, 401);
  } finally {
    await server.close();
  }
});
