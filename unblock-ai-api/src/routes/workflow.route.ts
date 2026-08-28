import { Router } from "express";
import { WorkflowController } from "../controllers/workflow.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAuth, requireRole } from "../middlewares/index.middleware.js";

export function createWorkflowRouter(controller: WorkflowController): Router {
  const router = Router();
  const admin = requireRole("admin");
  const auth = requireAuth();

  router.post("/workflows/extract", admin, asyncHandler(controller.extract));
  router.post("/workflows", admin, asyncHandler(controller.create));
  router.get("/workflows", auth, asyncHandler(controller.list));
  // Must precede "/workflows/:id" - otherwise "deletions" is captured as :id.
  router.get("/workflows/deletions", admin, asyncHandler(controller.listDeletions));
  router.get("/workflows/:id", auth, asyncHandler(controller.getById));
  router.put("/workflows/:id", admin, asyncHandler(controller.update));
  router.post("/workflows/:id/validate", admin, asyncHandler(controller.validate));
  router.get("/workflows/:id/record", auth, asyncHandler(controller.getRecord));
  router.patch("/workflows/:id/review", admin, asyncHandler(controller.setReviewStatus));
  router.patch("/workflows/:id/title", admin, asyncHandler(controller.rename));
  router.delete("/workflows/:id", admin, asyncHandler(controller.remove));

  return router;
}
