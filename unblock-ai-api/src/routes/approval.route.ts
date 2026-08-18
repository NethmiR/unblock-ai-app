import { Router } from "express";
import { ApprovalController } from "../controllers/approval.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";

export function createApprovalRouter(controller: ApprovalController): Router {
  const router = Router();

  router.get("/approvals/:token", asyncHandler(controller.getApproverView));
  router.post("/approvals/:token/decision", asyncHandler(controller.submitDecision));

  return router;
}
