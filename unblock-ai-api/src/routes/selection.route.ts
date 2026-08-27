import { Router } from "express";
import { SelectionController } from "../controllers/selection.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAuth } from "../middlewares/index.middleware.js";

export function createSelectionRouter(controller: SelectionController): Router {
  const router = Router();
  const auth = requireAuth();

  router.post("/selection/sessions", auth, asyncHandler(controller.startSession));
  router.post("/selection/sessions/:id/answer", auth, asyncHandler(controller.answerQuestion));
  router.post("/selection/sessions/:id/choose", auth, asyncHandler(controller.chooseWorkflow));
  router.get("/selection/sessions/:id/workflow", auth, asyncHandler(controller.getMatchedWorkflow));

  return router;
}
