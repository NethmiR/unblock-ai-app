import { Router, type RequestHandler } from "express";
import { createHealthRouter } from "./health.route.js";
import { createWorkflowRouter } from "./workflow.route.js";
import { createDraftRouter } from "./draft.route.js";
import { createSelectionRouter } from "./selection.route.js";
import { createTaskRouter } from "./task.route.js";
import { createApprovalRouter } from "./approval.route.js";
import { createAuthRouter } from "./auth.route.js";
import { createUserSessionRouter } from "./user-session.route.js";
import { createUserRouter } from "./user.route.js";
import { createDebugRouter } from "./debug.route.js";
import type { HealthController } from "../controllers/health.controller.js";
import type { WorkflowController } from "../controllers/workflow.controller.js";
import type { DraftController } from "../controllers/draft.controller.js";
import type { SelectionController } from "../controllers/selection.controller.js";
import type { TaskController } from "../controllers/task.controller.js";
import type { ApprovalController } from "../controllers/approval.controller.js";
import type { AuthController } from "../controllers/auth.controller.js";
import type { UserSessionController } from "../controllers/user-session.controller.js";
import type { UserController } from "../controllers/user.controller.js";

export interface ApiControllers {
  healthController: HealthController;
  workflowController: WorkflowController;
  draftController: DraftController;
  selectionController: SelectionController;
  taskController: TaskController;
  approvalController: ApprovalController;
  authController: AuthController;
  userSessionController: UserSessionController;
  userController: UserController;
}

export interface ApiRouteGuards {
  requireTaskOwnership: RequestHandler;
}

export function createApiRouter(controllers: ApiControllers, guards: ApiRouteGuards): Router {
  const router = Router();

  router.use(createHealthRouter(controllers.healthController));
  router.use(createAuthRouter(controllers.authController));
  router.use(createUserSessionRouter(controllers.userSessionController));
  router.use(createUserRouter(controllers.userController));
  router.use(createWorkflowRouter(controllers.workflowController));
  router.use(createDraftRouter(controllers.draftController));
  router.use(createSelectionRouter(controllers.selectionController));
  router.use(createTaskRouter(controllers.taskController, guards.requireTaskOwnership));
  router.use(createApprovalRouter(controllers.approvalController));
  // TEMPORARY - see debug.route.ts. Remove this line and the file once the mail deploy issue is resolved.
  router.use(createDebugRouter());

  return router;
}
