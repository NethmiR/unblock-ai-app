import { HealthController } from "../../src/controllers/health.controller.js";
import { WorkflowController } from "../../src/controllers/workflow.controller.js";
import { DraftController } from "../../src/controllers/draft.controller.js";
import { SelectionController } from "../../src/controllers/selection.controller.js";
import { TaskController } from "../../src/controllers/task.controller.js";
import { AuthController } from "../../src/controllers/auth.controller.js";
import { UserSessionController } from "../../src/controllers/user-session.controller.js";
import { UserController } from "../../src/controllers/user.controller.js";
import { UserService } from "../../src/services/user.service.js";
import { hashPassword } from "../../src/utils/shared/password.util.js";
import { Permission } from "../../src/data/constants/permission.constant.js";
import { UserStatus } from "../../src/data/constants/user.constant.js";
import {
  createTestAuthentication,
  startTestServer,
  type TestAuthentication,
  type TestServer,
} from "./test-server.helper.js";
import type { ApiControllers } from "../../src/routes/index.route.js";
import type { ApprovalController } from "../../src/controllers/approval.controller.js";
import type { WorkflowService } from "../../src/services/workflow.service.js";
import type { ExtractionService } from "../../src/services/extraction.service.js";
import type { DraftService } from "../../src/services/draft.service.js";
import type { SelectionService } from "../../src/services/selection.service.js";
import type { TaskService } from "../../src/services/task.service.js";
import type { AuthConfig } from "../../src/lib/types/config/config.type.js";
import type { UserCredentialRecord } from "../../src/lib/types/user/user.type.js";

export const LOGIN_PASSWORD = "Correct-Horse-Battery-Staple9";
export const TEST_DEFAULT_PASSWORD = "test-default-password";

export async function loginUser(
  overrides: Partial<UserCredentialRecord> = {},
): Promise<UserCredentialRecord> {
  const now = new Date();
  return {
    id: "00000000-0000-4000-8000-0000000000aa",
    email: "login-user@example.com",
    fullName: "Login User",
    passwordHash: await hashPassword(LOGIN_PASSWORD),
    status: UserStatus.ACTIVE,
    permissions: [Permission.TASK_CREATE],
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    lastLoginAt: null,
    createdByUserId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export interface AuthTestServer extends TestServer {
  authentication: TestAuthentication;
}

export async function startAuthTestServer(
  options: { users?: UserCredentialRecord[]; authConfig?: AuthConfig } = {},
): Promise<AuthTestServer> {
  const authentication = createTestAuthentication(options);
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
    authController: new AuthController({ authenticationService: authentication.authenticationService }),
    userSessionController: new UserSessionController({ userSessionService: authentication.userSessionService }),
    userController: new UserController({
      userService: new UserService({
        userRepository: authentication.userRepository,
        userConfig: { defaultPassword: TEST_DEFAULT_PASSWORD },
      }),
    }),
  };

  const server = await startTestServer(controllers, { authenticationService: authentication.authenticationService });
  return { ...server, authentication };
}

export async function postLogin(
  baseUrl: string,
  body: Record<string, unknown>,
  userAgent?: string,
): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(userAgent ? { "User-Agent": userAgent } : {}) },
    body: JSON.stringify(body),
  });
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
