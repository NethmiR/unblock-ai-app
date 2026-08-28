import test from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "../../../src/services/auth.service.js";
import { InMemoryAuthStore } from "../../../src/services/auth-store/in-memory.auth-store.js";
import { hashPassword } from "../../../src/utils/shared/password.util.js";
import { verifySessionToken } from "../../../src/utils/auth/session-token.util.js";
import { UnauthorizedError } from "../../../src/errors/unauthorized.error.js";
import { ForbiddenError } from "../../../src/errors/forbidden.error.js";
import type { AuthUserRow } from "../../../src/lib/types/auth/auth.type.js";
import type { AppConfig } from "../../../src/lib/types/config/config.type.js";

const SECRET = "test-session-secret";
const PASSWORD = "Correct-Horse-Battery-Staple9";

async function newAdminRow(overrides: Partial<AuthUserRow> = {}): Promise<AuthUserRow> {
  return {
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
    ...overrides,
  };
}

function newService(adminUsers: AuthUserRow[], maxFailedAttempts = 0): AuthService {
  const authConfig: AppConfig["auth"] = {
    sessionTokenSecret: SECRET,
    sessionTtlHours: 12,
    maxFailedAttempts,
    storeBackend: "memory",
  };
  const authStore = new InMemoryAuthStore({ adminUsers });
  return new AuthService({ authStore, config: { auth: authConfig } as AppConfig });
}

test("a bad password increments the failed-attempt counter", async () => {
  const row = await newAdminRow();
  const authStore = new InMemoryAuthStore({ adminUsers: [row] });
  const service = new AuthService({
    authStore,
    config: {
      auth: { sessionTokenSecret: SECRET, sessionTtlHours: 12, maxFailedAttempts: 0, storeBackend: "memory" },
    } as AppConfig,
  });

  await assert.rejects(() => service.login("admin", "admin", "wrong-password"), UnauthorizedError);

  const stored = await authStore.findByUsername("admin", "admin");
  assert.equal(stored?.failed_attempt_count, 1);
  assert.ok(stored?.last_failed_attempt_at);
});

test("three consecutive bad passwords leave failed_attempt_count at 3", async () => {
  const row = await newAdminRow();
  const authStore = new InMemoryAuthStore({ adminUsers: [row] });
  const service = new AuthService({
    authStore,
    config: {
      auth: { sessionTokenSecret: SECRET, sessionTtlHours: 12, maxFailedAttempts: 0, storeBackend: "memory" },
    } as AppConfig,
  });

  for (let i = 0; i < 3; i += 1) {
    await assert.rejects(() => service.login("admin", "admin", "wrong-password"), UnauthorizedError);
  }

  const stored = await authStore.findByUsername("admin", "admin");
  assert.equal(stored?.failed_attempt_count, 3);
  assert.ok(stored?.last_failed_attempt_at);
});

test("a good login resets the counter to 0 and stamps last_login_at", async () => {
  const row = await newAdminRow({ failed_attempt_count: 2 });
  const authStore = new InMemoryAuthStore({ adminUsers: [row] });
  const service = new AuthService({
    authStore,
    config: {
      auth: { sessionTokenSecret: SECRET, sessionTtlHours: 12, maxFailedAttempts: 0, storeBackend: "memory" },
    } as AppConfig,
  });

  const result = await service.login("admin", "admin", PASSWORD);

  assert.ok(result.token);
  assert.equal(result.user.username, "admin");
  const payload = verifySessionToken(result.token, SECRET);
  assert.ok(payload);
  assert.equal(payload.sub, row.id);
  assert.equal(payload.aud, "admin");

  const stored = await authStore.findByUsername("admin", "admin");
  assert.equal(stored?.failed_attempt_count, 0);
  assert.ok(stored?.last_login_at);
});

test("an unknown username throws Unauthorized without touching any row", async () => {
  const row = await newAdminRow();
  const authStore = new InMemoryAuthStore({ adminUsers: [row] });
  const service = new AuthService({
    authStore,
    config: {
      auth: { sessionTokenSecret: SECRET, sessionTtlHours: 12, maxFailedAttempts: 0, storeBackend: "memory" },
    } as AppConfig,
  });

  await assert.rejects(() => service.login("admin", "no-such-user", "anything"), UnauthorizedError);

  const stored = await authStore.findByUsername("admin", "admin");
  assert.equal(stored?.failed_attempt_count, 0);
  assert.equal(stored?.last_failed_attempt_at, null);
});

test("an inactive user gets Forbidden even with the correct password", async () => {
  const row = await newAdminRow({ is_active: false });
  const service = newService([row]);

  await assert.rejects(() => service.login("admin", "admin", PASSWORD), ForbiddenError);
});

test("account lockout is enforced only when AUTH_MAX_FAILED_ATTEMPTS > 0", async () => {
  const row = await newAdminRow();
  const authStore = new InMemoryAuthStore({ adminUsers: [row] });
  const service = new AuthService({
    authStore,
    config: {
      auth: { sessionTokenSecret: SECRET, sessionTtlHours: 12, maxFailedAttempts: 2, storeBackend: "memory" },
    } as AppConfig,
  });

  await assert.rejects(() => service.login("admin", "admin", "wrong"), UnauthorizedError);
  await assert.rejects(() => service.login("admin", "admin", "wrong"), ForbiddenError);
});

test("getUserFromToken returns null for an invalid or expired token", async () => {
  const row = await newAdminRow();
  const service = newService([row]);

  assert.equal(await service.getUserFromToken("garbage"), null);
});
