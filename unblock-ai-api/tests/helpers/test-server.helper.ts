import type { AddressInfo } from "node:net";
import { createApp } from "../../src/app.js";
import { createAuthStore } from "../../src/services/auth-store/index.auth-store.js";
import { AuthService } from "../../src/services/auth.service.js";
import { issueSessionToken } from "../../src/utils/auth/session-token.util.js";
import type { ApiControllers } from "../../src/routes/index.route.js";
import type { AppConfig } from "../../src/lib/types/config/config.type.js";
import type { AuthAudience, AuthUser, AuthUserRow } from "../../src/lib/types/auth/auth.type.js";

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

const TEST_SESSION_SECRET = "test-session-secret";

/** Seeded rows the default in-memory auth store carries, so route tests can
 *  authenticate without a live Postgres (D-5). Not connected to any test's
 *  own fake stores - only used for req.user identity via the bearer token. */
export const TEST_ADMIN_ROW: AuthUserRow = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "test-admin",
  email: "test-admin@example.com",
  full_name: "Test Admin",
  department: "Registrar's Office",
  organisation: null,
  faculty: null,
  password_hash: "unused-in-tests",
  is_active: true,
  last_login_at: null,
  failed_attempt_count: 0,
  last_failed_attempt_at: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

export const TEST_PORTAL_ROW: AuthUserRow = {
  id: "00000000-0000-0000-0000-000000000002",
  username: "test-portal",
  email: "test-portal@example.com",
  full_name: "Test Portal User",
  department: "Department of Information Technology",
  organisation: null,
  faculty: "Information Technology",
  password_hash: "unused-in-tests",
  is_active: true,
  last_login_at: null,
  failed_attempt_count: 0,
  last_failed_attempt_at: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

/** No real Postgres needed for route tests - the in-memory store backs auth (D-5). */
function defaultAuthService(): AuthService {
  const authConfig: AppConfig["auth"] = {
    sessionTokenSecret: TEST_SESSION_SECRET,
    sessionTtlHours: 12,
    maxFailedAttempts: 0,
    storeBackend: "memory",
  };
  const authStore = createAuthStore("memory", { adminUsers: [TEST_ADMIN_ROW], portalUsers: [TEST_PORTAL_ROW] });
  return new AuthService({ authStore, config: { auth: authConfig } as AppConfig });
}

function rowToAuthUser(row: AuthUserRow, audience: AuthAudience): AuthUser {
  return {
    id: row.id,
    audience,
    username: row.username,
    email: row.email,
    full_name: row.full_name,
    department: row.department,
    organisation: row.organisation,
    faculty: row.faculty,
  };
}

/** Bearer header for the seeded admin, valid against `defaultAuthService()`'s store. */
export function adminAuthHeader(): Record<string, string> {
  const { token } = issueSessionToken(rowToAuthUser(TEST_ADMIN_ROW, "admin"), TEST_SESSION_SECRET, 12);
  return { Authorization: `Bearer ${token}` };
}

/** Bearer header for the seeded portal user - proves the wrong-role 403 case on admin routes. */
export function portalAuthHeader(): Record<string, string> {
  const { token } = issueSessionToken(rowToAuthUser(TEST_PORTAL_ROW, "portal"), TEST_SESSION_SECRET, 12);
  return { Authorization: `Bearer ${token}` };
}

export async function startTestServer(
  controllers: ApiControllers,
  deps: { authService?: AuthService } = {},
): Promise<TestServer> {
  const app = createApp(controllers, { authService: deps.authService ?? defaultAuthService() });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
