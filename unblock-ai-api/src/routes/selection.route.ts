import { Router } from "express";
import { SelectionController } from "../controllers/selection.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";

export function createSelectionRouter(controller: SelectionController): Router {
  const router = Router();

  router.post("/selection/sessions", asyncHandler(controller.startSession));
  router.post("/selection/sessions/:id/answer", asyncHandler(controller.answerQuestion));
  router.post("/selection/sessions/:id/choose", asyncHandler(controller.chooseWorkflow));
  router.get("/selection/sessions/:id/workflow", asyncHandler(controller.getMatchedWorkflow));

  return router;
}
