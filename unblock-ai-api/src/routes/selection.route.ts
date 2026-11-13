import { Router } from "express";
import { SelectionController } from "../controllers/selection.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAnyPermission } from "../middlewares/index.middleware.js";
import { Permission } from "../data/constants/permission.constant.js";

export function createSelectionRouter(controller: SelectionController): Router {
  const router = Router();
  const createTasks = requireAnyPermission(Permission.TASK_CREATE);

  router.get("/selection/catalogue", createTasks, asyncHandler(controller.getCatalogue));
  router.post("/selection/sessions", createTasks, asyncHandler(controller.startSession));
  router.get("/selection/sessions/:id", createTasks, asyncHandler(controller.getSession));
  router.post("/selection/sessions/:id/messages", createTasks, asyncHandler(controller.postMessage));
  router.post("/selection/sessions/:id/choose", createTasks, asyncHandler(controller.chooseWorkflowTemplate));
  router.delete("/selection/sessions/:id", createTasks, asyncHandler(controller.discardSession));

  return router;
}
