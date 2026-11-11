import { Router } from "express";
import { DraftController } from "../controllers/draft.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAnyPermission } from "../middlewares/index.middleware.js";
import { Permission } from "../data/constants/permission.constant.js";

export function createDraftRouter(controller: DraftController): Router {
  const router = Router();
  const manageWorkflows = requireAnyPermission(Permission.WORKFLOW_MANAGE);

  router.post("/drafts", manageWorkflows, asyncHandler(controller.create));
  router.get("/drafts", manageWorkflows, asyncHandler(controller.list));
  router.get("/drafts/:id", manageWorkflows, asyncHandler(controller.getById));
  router.post("/drafts/:id/extract", manageWorkflows, asyncHandler(controller.extractFromDraft));

  return router;
}
