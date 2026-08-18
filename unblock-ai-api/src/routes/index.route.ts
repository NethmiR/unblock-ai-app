import { Router } from "express";
import { createHealthRouter } from "./health.route.js";
import { createWorkflowRouter } from "./workflow.route.js";
import { createDraftRouter } from "./draft.route.js";
import { createSelectionRouter } from "./selection.route.js";
import { createTaskRouter } from "./task.route.js";
import { createApprovalRouter } from "./approval.route.js";
import type { HealthController } from "../controllers/health.controller.js";
import type { WorkflowController } from "../controllers/workflow.controller.js";
import type { DraftController } from "../controllers/draft.controller.js";
import type { SelectionController } from "../controllers/selection.controller.js";
import type { TaskController } from "../controllers/task.controller.js";
import type { ApprovalController } from "../controllers/approval.controller.js";

export interface ApiControllers {
  healthController: HealthController;
  workflowController: WorkflowController;
  draftController: DraftController;
  selectionController: SelectionController;
  taskController: TaskController;
  approvalController: ApprovalController;
}

export function createApiRouter(controllers: ApiControllers): Router {
  const router = Router();

  router.use(createHealthRouter(controllers.healthController));
  router.use(createWorkflowRouter(controllers.workflowController));
  router.use(createDraftRouter(controllers.draftController));
  router.use(createSelectionRouter(controllers.selectionController));
  router.use(createTaskRouter(controllers.taskController));
  router.use(createApprovalRouter(controllers.approvalController));

  return router;
}
