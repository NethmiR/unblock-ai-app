import type { AddressInfo } from "node:net";
import { createApp } from "../../src/app.js";
import { HealthController } from "../../src/controllers/health.controller.js";
import { createRequireTaskOwnership } from "../../src/middlewares/require-task-ownership.middleware.js";
import { AuthenticationService } from "../../src/services/authentication.service.js";
import { UserSessionService } from "../../src/services/user-session.service.js";
import {
  createInMemoryRepositoryRegistry,
  type InMemoryRepositoryRegistry,
} from "../../src/repositories/repository-registry.factory.js";
import type { InMemoryUserRepository } from "../../src/repositories/user-repository/in-memory.user-repository.js";
import type { InMemoryUserSessionRepository } from "../../src/repositories/user-session-repository/in-memory.user-session-repository.js";
import { hashUserSessionToken } from "../../src/utils/auth/user-session-token.util.js";
import { AUTHORIZATION_SCHEME } from "../../src/data/constants/auth.constant.js";
import { PERMISSIONS, Permission } from "../../src/data/constants/permission.constant.js";
import { UserStatus } from "../../src/data/constants/user.constant.js";
import type { ApiControllers, ApiRouteGuards } from "../../src/routes/index.route.js";
import type { AuthConfig } from "../../src/lib/types/config/config.type.js";
import type { UserCredentialRecord } from "../../src/lib/types/user/user.type.js";
import type { UserSessionRecord } from "../../src/lib/types/user-session/user-session.type.js";

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

export enum TestIdentity {
  WORKFLOW_MANAGER = "workflow-manager",
  TASK_CREATOR = "task-creator",
  USER_MANAGER = "user-manager",
  ORGANISATION_MANAGER = "organisation-manager",
  ADMINISTRATOR = "administrator",
}

export const TEST_AUTH_CONFIG: AuthConfig = {
  sessionTtlHours: 12,
  maxFailedAttempts: 0,
  lockoutDurationMinutes: 15,
};

const CREATED_AT = new Date("2026-01-01T00:00:00Z");
const SESSION_EXPIRY = new Date("2099-01-01T00:00:00Z");

function testUser(id: string, identity: TestIdentity, fullName: string, permissions: Permission[]): UserCredentialRecord {
  return testUserRecord(id, `${identity}@example.com`, fullName, permissions);
}

export function testUserRecord(id: string, email: string, fullName: string, permissions: Permission[]): UserCredentialRecord {
  return {
    id,
    email,
    fullName,
    passwordHash: "unused-in-tests",
    status: UserStatus.ACTIVE,
    permissions,
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    lastLoginAt: null,
    createdByUserId: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

export const TEST_USERS: Record<TestIdentity, UserCredentialRecord> = {
  [TestIdentity.WORKFLOW_MANAGER]: testUser(
    "00000000-0000-4000-8000-000000000001",
    TestIdentity.WORKFLOW_MANAGER,
    "Test Workflow Manager",
    [Permission.WORKFLOW_MANAGE],
  ),
  [TestIdentity.TASK_CREATOR]: testUser(
    "00000000-0000-4000-8000-000000000002",
    TestIdentity.TASK_CREATOR,
    "Test Task Creator",
    [Permission.TASK_CREATE],
  ),
  [TestIdentity.USER_MANAGER]: testUser(
    "00000000-0000-4000-8000-000000000003",
    TestIdentity.USER_MANAGER,
    "Test User Manager",
    [Permission.USER_MANAGE],
  ),
  [TestIdentity.ORGANISATION_MANAGER]: testUser(
    "00000000-0000-4000-8000-000000000005",
    TestIdentity.ORGANISATION_MANAGER,
    "Test Organisation Manager",
    [Permission.ORGANISATION_MANAGE],
  ),
  [TestIdentity.ADMINISTRATOR]: testUser(
    "00000000-0000-4000-8000-000000000004",
    TestIdentity.ADMINISTRATOR,
    "Test Administrator",
    [...PERMISSIONS],
  ),
};

export const TEST_SESSION_TOKENS: Record<TestIdentity, string> = {
  [TestIdentity.WORKFLOW_MANAGER]: "test-session-token-workflow-manager",
  [TestIdentity.TASK_CREATOR]: "test-session-token-task-creator",
  [TestIdentity.USER_MANAGER]: "test-session-token-user-manager",
  [TestIdentity.ORGANISATION_MANAGER]: "test-session-token-organisation-manager",
  [TestIdentity.ADMINISTRATOR]: "test-session-token-administrator",
};

export interface ExtraTestSession {
  userId: string;
  token: string;
}

function testSession(identity: TestIdentity, index: number): UserSessionRecord {
  return sessionRecord(`00000000-0000-4000-9000-00000000000${index + 1}`, TEST_USERS[identity].id, TEST_SESSION_TOKENS[identity]);
}

function sessionRecord(id: string, userId: string, token: string): UserSessionRecord {
  return {
    id,
    userId,
    tokenHash: hashUserSessionToken(token),
    userAgent: null,
    createdAt: CREATED_AT,
    lastSeenAt: new Date(),
    expiresAt: SESSION_EXPIRY,
    revokedAt: null,
    revocationReason: null,
  };
}

export interface TestAuthentication {
  repositories: InMemoryRepositoryRegistry;
  userRepository: InMemoryUserRepository;
  userSessionRepository: InMemoryUserSessionRepository;
  userSessionService: UserSessionService;
  authenticationService: AuthenticationService;
}

export function createTestAuthentication(
  options: { users?: UserCredentialRecord[]; sessions?: ExtraTestSession[]; authConfig?: AuthConfig } = {},
): TestAuthentication {
  const authConfig = options.authConfig ?? TEST_AUTH_CONFIG;
  const identities = Object.values(TestIdentity);
  const repositories = createInMemoryRepositoryRegistry({
    users: [...identities.map((identity) => TEST_USERS[identity]), ...(options.users ?? [])],
    userSessions: [
      ...identities.map((identity, index) => testSession(identity, index)),
      ...(options.sessions ?? []).map((session, index) =>
        sessionRecord(`00000000-0000-4000-9100-${String(index + 1).padStart(12, "0")}`, session.userId, session.token),
      ),
    ],
  });
  const { userRepository, userSessionRepository } = repositories;
  const userSessionService = new UserSessionService({ userSessionRepository, authConfig });
  const authenticationService = new AuthenticationService({ userRepository, userSessionService, authConfig });
  return { repositories, userRepository, userSessionRepository, userSessionService, authenticationService };
}

export function authHeaderFor(identity: TestIdentity): Record<string, string> {
  return { Authorization: `${AUTHORIZATION_SCHEME} ${TEST_SESSION_TOKENS[identity]}` };
}

export async function startTestServer(
  controllers: ApiControllers,
  deps: { authenticationService?: AuthenticationService; routeGuards?: ApiRouteGuards } = {},
): Promise<TestServer> {
  const authenticationService = deps.authenticationService ?? createTestAuthentication().authenticationService;
  const routeGuards = deps.routeGuards ?? {
    requireTaskOwnership: createRequireTaskOwnership({ taskService: { isOwnedBy: async () => true } }),
  };
  const app = createApp(controllers, { authenticationService, routeGuards });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function unusedController<T>(): T {
  return new Proxy({}, { get: () => () => Promise.reject(new Error("controller not under test")) }) as T;
}

export function createTestControllers(overrides: Partial<ApiControllers> = {}): ApiControllers {
  return {
    healthController: new HealthController(),
    workflowTemplateController: unusedController(),
    selectionController: unusedController(),
    taskController: unusedController(),
    taskFormController: unusedController(),
    approvalController: unusedController(),
    approverController: unusedController(),
    authController: unusedController(),
    userSessionController: unusedController(),
    userController: unusedController(),
    organisationalUnitController: unusedController(),
    designationController: unusedController(),
    userAffiliationController: unusedController(),
    ...overrides,
  };
}
