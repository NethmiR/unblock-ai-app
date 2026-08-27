import { Router } from "express";
import { DraftController } from "../controllers/draft.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireRole } from "../middlewares/index.middleware.js";

export function createDraftRouter(controller: DraftController): Router {
  const router = Router();
  const admin = requireRole("admin");

  router.post("/drafts", admin, asyncHandler(controller.create));
  router.get("/drafts", admin, asyncHandler(controller.list));
  router.get("/drafts/:id", admin, asyncHandler(controller.getById));
  router.post("/drafts/:id/extract", admin, asyncHandler(controller.extractFromDraft));

  return router;
}
