import { Router, type RequestHandler } from "express";
import { TaskController } from "../controllers/task.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAnyPermission } from "../middlewares/index.middleware.js";
import { Permission } from "../data/constants/permission.constant.js";

export function createTaskRouter(controller: TaskController, requireTaskOwnership: RequestHandler): Router {
  const router = Router();
  const createTasks = requireAnyPermission(Permission.TASK_CREATE);

  router.post("/tasks", createTasks, asyncHandler(controller.createTask));
  router.get("/tasks", createTasks, asyncHandler(controller.listTasks));
  router.get("/tasks/:id/status", createTasks, requireTaskOwnership, asyncHandler(controller.getTaskStatus));
  router.get("/tasks/:id/document", createTasks, requireTaskOwnership, asyncHandler(controller.getTaskDocument));
  router.get("/tasks/:id", createTasks, requireTaskOwnership, asyncHandler(controller.getTask));
  router.get("/tasks/:id/next", createTasks, requireTaskOwnership, asyncHandler(controller.getNext));
  router.post("/tasks/:id/values", createTasks, requireTaskOwnership, asyncHandler(controller.setValue));
  router.post("/tasks/:id/finalize", createTasks, requireTaskOwnership, asyncHandler(controller.finalizeTask));
  router.post("/tasks/:id/start", createTasks, requireTaskOwnership, asyncHandler(controller.startTask));
  router.patch("/tasks/:id/status", createTasks, requireTaskOwnership, asyncHandler(controller.updateStatus));
  router.delete("/tasks/:id", createTasks, requireTaskOwnership, asyncHandler(controller.deleteTask));

  return router;
}
