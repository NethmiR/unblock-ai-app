import { Router, type RequestHandler } from "express";
import { createHealthRouter } from "./health.route.js";
import { createWorkflowTemplateRouter } from "./workflow-template.route.js";
import { createSelectionRouter } from "./selection.route.js";
import { createTaskRouter } from "./task.route.js";
import { createApprovalRouter } from "./approval.route.js";
import { createAuthRouter } from "./auth.route.js";
import { createUserSessionRouter } from "./user-session.route.js";
import { createUserRouter } from "./user.route.js";
import { createOrganisationalUnitRouter } from "./organisational-unit.route.js";
import { createDesignationRouter } from "./designation.route.js";
import { createUserAffiliationRouter } from "./user-affiliation.route.js";
import { createDebugRouter } from "./debug.route.js";
import type { HealthController } from "../controllers/health.controller.js";
import type { WorkflowTemplateController } from "../controllers/workflow-template.controller.js";
import type { SelectionController } from "../controllers/selection.controller.js";
import type { TaskController } from "../controllers/task.controller.js";
import type { ApprovalController } from "../controllers/approval.controller.js";
import type { AuthController } from "../controllers/auth.controller.js";
import type { UserSessionController } from "../controllers/user-session.controller.js";
import type { UserController } from "../controllers/user.controller.js";
import type { OrganisationalUnitController } from "../controllers/organisational-unit.controller.js";
import type { DesignationController } from "../controllers/designation.controller.js";
import type { UserAffiliationController } from "../controllers/user-affiliation.controller.js";

export interface ApiControllers {
  healthController: HealthController;
  workflowTemplateController: WorkflowTemplateController;
  selectionController: SelectionController;
  taskController: TaskController;
  approvalController: ApprovalController;
  authController: AuthController;
  userSessionController: UserSessionController;
  userController: UserController;
  organisationalUnitController: OrganisationalUnitController;
  designationController: DesignationController;
  userAffiliationController: UserAffiliationController;
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
  router.use(createUserAffiliationRouter(controllers.userAffiliationController));
  router.use(createOrganisationalUnitRouter(controllers.organisationalUnitController));
  router.use(createDesignationRouter(controllers.designationController));
  router.use(createWorkflowTemplateRouter(controllers.workflowTemplateController));
  router.use(createSelectionRouter(controllers.selectionController));
  router.use(createTaskRouter(controllers.taskController, guards.requireTaskOwnership));
  router.use(createApprovalRouter(controllers.approvalController));
  // TEMPORARY - see debug.route.ts. Remove this line and the file once the mail deploy issue is resolved.
  router.use(createDebugRouter());

  return router;
}
