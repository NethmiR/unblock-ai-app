import { Router } from "express";
import { DraftController } from "../controllers/draft.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";

export function createDraftRouter(controller: DraftController): Router {
  const router = Router();

  router.post("/drafts", asyncHandler(controller.create));
  router.get("/drafts", asyncHandler(controller.list));
  router.get("/drafts/:id", asyncHandler(controller.getById));
  router.post("/drafts/:id/extract", asyncHandler(controller.extractFromDraft));

  return router;
}
