import { Router } from "express";
import { SelectionController } from "../controllers/selection.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAnyPermission } from "../middlewares/index.middleware.js";
import { Permission } from "../data/constants/permission.constant.js";

export function createSelectionRouter(controller: SelectionController): Router {
  const router = Router();
  const createTasks = requireAnyPermission(Permission.TASK_CREATE);

  router.post("/selection/sessions", createTasks, asyncHandler(controller.startSession));
  router.post("/selection/sessions/:id/answer", createTasks, asyncHandler(controller.answerQuestion));
  router.post("/selection/sessions/:id/choose", createTasks, asyncHandler(controller.chooseWorkflowTemplate));
  router.get("/selection/sessions/:id/workflow-template", createTasks, asyncHandler(controller.getMatchedWorkflowTemplate));

  return router;
}
