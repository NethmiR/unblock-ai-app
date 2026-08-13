import { Router } from "express";
import { WorkflowController } from "../controllers/workflow.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";

export function createWorkflowRouter(controller: WorkflowController): Router {
  const router = Router();

  router.post("/workflows/extract", asyncHandler(controller.extract));
  router.post("/workflows", asyncHandler(controller.create));
  router.get("/workflows", asyncHandler(controller.list));
  router.get("/workflows/:id", asyncHandler(controller.getById));
  router.put("/workflows/:id", asyncHandler(controller.update));
  router.post("/workflows/:id/validate", asyncHandler(controller.validate));
  router.get("/workflows/:id/record", asyncHandler(controller.getRecord));
  router.patch("/workflows/:id/review", asyncHandler(controller.setReviewStatus));

  return router;
}
