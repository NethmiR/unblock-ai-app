import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowController } from "../../src/controllers/workflow.controller.js";
import { DraftController } from "../../src/controllers/draft.controller.js";
import { SelectionController } from "../../src/controllers/selection.controller.js";
import { HealthController } from "../../src/controllers/health.controller.js";
import { WorkflowService } from "../../src/services/workflow.service.js";
import { ValidationService } from "../../src/services/validation.service.js";
import { startTestServer, type TestServer } from "../helpers/test-server.helper.js";
import { FakeTemplateModel } from "../helpers/fake-model.helper.js";
import { loadExpectedFixture } from "../helpers/fixture.helper.js";
import type { EmbeddingService } from "../../src/services/embedding.service.js";
import type { ExtractionService } from "../../src/services/extraction.service.js";
import type { SelectionService } from "../../src/services/selection.service.js";
import type { ApiControllers } from "../../src/routes/index.route.js";

const fixture = loadExpectedFixture("it_faculty_overseas_leave.json");

function fakeEmbeddingService(): EmbeddingService {
  return {
    embedDocument: () => Promise.resolve(new Array(8).fill(0)),
    embedQuery: () => Promise.resolve(new Array(8).fill(0)),
    metadata: () => ({ model: "fake", dim: 8, embedded_at: new Date().toISOString() }),
  } as unknown as EmbeddingService;
}

async function buildServer(): Promise<TestServer & { close: () => Promise<void> }> {
  const templateModel = new FakeTemplateModel();
  const workflowService = new WorkflowService({
    templateModel: templateModel as unknown as ConstructorParameters<typeof WorkflowService>[0]["templateModel"],
    embeddingService: fakeEmbeddingService(),
    validationService: new ValidationService(),
  });
  const validationService = new ValidationService();

  const controllers: ApiControllers = {
    healthController: new HealthController(),
    workflowController: new WorkflowController({
      workflowService,
      extractionService: {} as ExtractionService,
      validationService,
    }),
    draftController: new DraftController({
      draftService: { list: () => Promise.resolve([]) } as never,
      extractionService: {} as ExtractionService,
      workflowService,
    }),
    selectionController: new SelectionController({ selectionService: {} as SelectionService }),
  };

  return startTestServer(controllers);
}

test("POST /api/workflows/extract rejects an empty text body", async () => {
  const server = await buildServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/workflows/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "  " }),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("POST /api/workflows saves a valid workflow", async () => {
  const server = await buildServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: fixture }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as { id: string; version: number };
    assert.equal(body.id, fixture.workflow_id);
    assert.equal(body.version, 1);
  } finally {
    await server.close();
  }
});

test("POST /api/workflows rejects an invalid workflow with validation errors", async () => {
  const server = await buildServer();
  try {
    const invalid = { ...fixture, steps: [] };
    const res = await fetch(`${server.baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: invalid }),
    });

    // The new architecture consolidates schema-invalid workflows under
    // ValidationError (400); 422 is reserved for ExtractionError (see §2.4).
    assert.equal(res.status, 400);
    const body = (await res.json()) as { details: string[] };
    assert(Array.isArray(body.details) && body.details.length > 0);
  } finally {
    await server.close();
  }
});

test("POST /api/workflows rejects a missing workflow body", async () => {
  const server = await buildServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("GET /api/workflows lists saved summaries", async () => {
  const server = await buildServer();
  try {
    await fetch(`${server.baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: fixture }),
    });

    const res = await fetch(`${server.baseUrl}/api/workflows`);
    assert.equal(res.status, 200);
    const summaries = (await res.json()) as Array<{ workflow_id: string }>;
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.workflow_id, fixture.workflow_id);
  } finally {
    await server.close();
  }
});

test("GET /api/workflows/:id fetches a saved workflow", async () => {
  const server = await buildServer();
  try {
    await fetch(`${server.baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: fixture }),
    });

    const res = await fetch(`${server.baseUrl}/api/workflows/${fixture.workflow_id}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { workflow_id: string };
    assert.equal(body.workflow_id, fixture.workflow_id);
  } finally {
    await server.close();
  }
});

test("GET /api/workflows/:id returns 404 for an unknown id", async () => {
  const server = await buildServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/workflows/does_not_exist`);
    assert.equal(res.status, 404);
  } finally {
    await server.close();
  }
});

test("PUT /api/workflows/:id saves a new version", async () => {
  const server = await buildServer();
  try {
    await fetch(`${server.baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: fixture }),
    });

    const res = await fetch(`${server.baseUrl}/api/workflows/${fixture.workflow_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: { ...fixture, title: "Edited title" } }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { version: number };
    assert.equal(body.version, 2);
  } finally {
    await server.close();
  }
});

test("POST /api/workflows/:id/validate reports errors without saving", async () => {
  const server = await buildServer();
  try {
    const invalid = { ...fixture, steps: [] };
    const res = await fetch(`${server.baseUrl}/api/workflows/${fixture.workflow_id}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: invalid }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { valid: boolean; errors: string[] };
    assert.equal(body.valid, false);
    assert(body.errors.length > 0);

    const listRes = await fetch(`${server.baseUrl}/api/workflows`);
    assert.equal(((await listRes.json()) as unknown[]).length, 0);
  } finally {
    await server.close();
  }
});

test("GET /api/workflows/:id/record returns the full row including draft_id", async () => {
  const server = await buildServer();
  try {
    await fetch(`${server.baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: fixture }),
    });

    const res = await fetch(`${server.baseUrl}/api/workflows/${fixture.workflow_id}/record`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { workflow_id: string; document: { title: string } };
    assert.equal(body.workflow_id, fixture.workflow_id);
    assert.equal(body.document.title, fixture.title);
  } finally {
    await server.close();
  }
});

test("GET /api/workflows/:id/record returns 404 for an unknown workflow", async () => {
  const server = await buildServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/workflows/does_not_exist/record`);
    assert.equal(res.status, 404);
  } finally {
    await server.close();
  }
});

test("PATCH /api/workflows/:id/review rejects an invalid review_status", async () => {
  const server = await buildServer();
  try {
    await fetch(`${server.baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: fixture }),
    });

    const res = await fetch(`${server.baseUrl}/api/workflows/${fixture.workflow_id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_status: "not_a_real_status" }),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("PATCH /api/workflows/:id/review returns 404 for an unknown workflow", async () => {
  const server = await buildServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/workflows/does_not_exist/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_status: "confirmed" }),
    });
    assert.equal(res.status, 404);
  } finally {
    await server.close();
  }
});

test("PATCH /api/workflows/:id/review publishes a template", async () => {
  const server = await buildServer();
  try {
    await fetch(`${server.baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: fixture }),
    });

    const res = await fetch(`${server.baseUrl}/api/workflows/${fixture.workflow_id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_status: "confirmed" }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { review_status: string };
    assert.equal(body.review_status, "confirmed");
  } finally {
    await server.close();
  }
});
