import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowController } from "../../src/controllers/workflow.controller.js";
import { DraftController } from "../../src/controllers/draft.controller.js";
import { SelectionController } from "../../src/controllers/selection.controller.js";
import { TaskController } from "../../src/controllers/task.controller.js";
import { HealthController } from "../../src/controllers/health.controller.js";
import { AuthController } from "../../src/controllers/auth.controller.js";
import { AuthService } from "../../src/services/auth.service.js";
import { InMemoryAuthStore } from "../../src/services/auth-store/in-memory.auth-store.js";
import { hashPassword } from "../../src/utils/shared/password.util.js";
import { startTestServer, type TestServer } from "../helpers/test-server.helper.js";
import type { ExtractionService } from "../../src/services/extraction.service.js";
import type { WorkflowService } from "../../src/services/workflow.service.js";
import type { DraftService } from "../../src/services/draft.service.js";
import type { SelectionService } from "../../src/services/selection.service.js";
import type { TaskService } from "../../src/services/task.service.js";
import type { ApprovalController } from "../../src/controllers/approval.controller.js";
import type { ApiControllers } from "../../src/routes/index.route.js";
import type { AuthUserRow } from "../../src/lib/types/auth/auth.type.js";
import type { AppConfig } from "../../src/lib/types/config/config.type.js";

const PASSWORD = "Correct-Horse-Battery-Staple9";
const SECRET = "test-auth-route-secret";

async function buildServer(): Promise<TestServer> {
  const adminRow: AuthUserRow = {
    id: "a-1",
    username: "admin",
    email: "admin@example.com",
    full_name: "Test Admin",
    department: null,
    organisation: null,
    faculty: null,
    password_hash: await hashPassword(PASSWORD),
    is_active: true,
    last_login_at: null,
    failed_attempt_count: 0,
    last_failed_attempt_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
  const authConfig: AppConfig["auth"] = {
    sessionTokenSecret: SECRET,
    sessionTtlHours: 12,
    maxFailedAttempts: 0,
    storeBackend: "memory",
  };
  const authService = new AuthService({
    authStore: new InMemoryAuthStore({ adminUsers: [adminRow] }),
    config: { auth: authConfig } as AppConfig,
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
      draftService: {} as DraftService,
      extractionService: {} as ExtractionService,
      workflowService: {} as WorkflowService,
    }),
    selectionController: new SelectionController({ selectionService: {} as SelectionService }),
    taskController: new TaskController({ taskService: {} as TaskService }),
    approvalController: {} as ApprovalController,
    authController: new AuthController({ authService }),
  };

  return startTestServer(controllers, { authService });
}

test("POST /api/auth/login with correct credentials returns 200 with a token", async () => {
  const server = await buildServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience: "admin", username: "admin", password: PASSWORD }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { token: string; expires_at: string; user: { username: string } };
    assert.ok(body.token);
    assert.ok(body.expires_at);
    assert.equal(body.user.username, "admin");
  } finally {
    await server.close();
  }
});

test("POST /api/auth/login with a wrong password returns 401", async () => {
  const server = await buildServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience: "admin", username: "admin", password: "wrong" }),
    });
    assert.equal(res.status, 401);
  } finally {
    await server.close();
  }
});

test("POST /api/auth/login with an unknown username returns 401", async () => {
  const server = await buildServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience: "admin", username: "nobody", password: "whatever" }),
    });
    assert.equal(res.status, 401);
  } finally {
    await server.close();
  }
});

test("POST /api/auth/login rejects a missing audience", async () => {
  const server = await buildServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: PASSWORD }),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("GET /api/auth/me with a valid token returns the user", async () => {
  const server = await buildServer();
  try {
    const loginRes = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience: "admin", username: "admin", password: PASSWORD }),
    });
    const { token } = (await loginRes.json()) as { token: string };

    const res = await fetch(`${server.baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { user: { username: string } };
    assert.equal(body.user.username, "admin");
  } finally {
    await server.close();
  }
});

test("GET /api/auth/me with no token returns 401", async () => {
  const server = await buildServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/auth/me`);
    assert.equal(res.status, 401);
  } finally {
    await server.close();
  }
});

test("GET /api/auth/me with a garbage token returns 401", async () => {
  const server = await buildServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/auth/me`, {
      headers: { Authorization: "Bearer garbage" },
    });
    assert.equal(res.status, 401);
  } finally {
    await server.close();
  }
});

test("POST /api/auth/logout returns 204", async () => {
  const server = await buildServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/auth/logout`, { method: "POST" });
    assert.equal(res.status, 204);
  } finally {
    await server.close();
  }
});
