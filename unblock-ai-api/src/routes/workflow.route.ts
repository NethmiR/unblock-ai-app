import { Router } from "express";
import { WorkflowController } from "../controllers/workflow.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAnyPermission } from "../middlewares/index.middleware.js";
import { Permission } from "../data/constants/permission.constant.js";

export function createWorkflowRouter(controller: WorkflowController): Router {
  const router = Router();
  const manageWorkflows = requireAnyPermission(Permission.WORKFLOW_MANAGE);
  const readWorkflows = requireAnyPermission(Permission.WORKFLOW_MANAGE, Permission.TASK_CREATE);

  router.post("/workflows/extract", manageWorkflows, asyncHandler(controller.extract));
  router.post("/workflows", manageWorkflows, asyncHandler(controller.create));
  router.get("/workflows", readWorkflows, asyncHandler(controller.list));
  // Must precede "/workflows/:id" - otherwise "deletions" is captured as :id.
  router.get("/workflows/deletions", manageWorkflows, asyncHandler(controller.listDeletions));
  router.get("/workflows/:id", readWorkflows, asyncHandler(controller.getById));
  router.put("/workflows/:id", manageWorkflows, asyncHandler(controller.update));
  router.post("/workflows/:id/validate", manageWorkflows, asyncHandler(controller.validate));
  router.get("/workflows/:id/record", readWorkflows, asyncHandler(controller.getRecord));
  router.patch("/workflows/:id/review", manageWorkflows, asyncHandler(controller.setReviewStatus));
  router.patch("/workflows/:id/title", manageWorkflows, asyncHandler(controller.rename));
  router.delete("/workflows/:id", manageWorkflows, asyncHandler(controller.remove));

  return router;
}
