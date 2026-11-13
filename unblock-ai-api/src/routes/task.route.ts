import { Router, type RequestHandler } from "express";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAnyPermission } from "../middlewares/index.middleware.js";
import { Permission } from "../data/constants/permission.constant.js";
import type { TaskController } from "../controllers/task.controller.js";
import type { TaskFormController } from "../controllers/task-form.controller.js";

export function createTaskRouter(
  controller: TaskController,
  formController: TaskFormController,
  requireTaskOwnership: RequestHandler,
): Router {
  const router = Router();
  const createTasks = requireAnyPermission(Permission.TASK_CREATE);
  const owned = [createTasks, requireTaskOwnership];

  router.post("/tasks", createTasks, asyncHandler(controller.createTask));
  router.get("/tasks", createTasks, asyncHandler(controller.listTasks));
  router.get("/tasks/:id", ...owned, asyncHandler(controller.getTask));
  router.get("/tasks/:id/workflow-definition", ...owned, asyncHandler(controller.getWorkflowDefinition));
  router.put("/tasks/:id/forms/:formId/draft", ...owned, asyncHandler(formController.saveDraft));
  router.post("/tasks/:id/forms/:formId/submit", ...owned, asyncHandler(formController.submit));
  router.post("/tasks/:id/cancel", ...owned, asyncHandler(controller.cancelTask));
  router.get("/tasks/:id/transcript", ...owned, asyncHandler(controller.getTranscript));
  router.delete("/tasks/:id", ...owned, asyncHandler(controller.deleteTask));

  return router;
}
