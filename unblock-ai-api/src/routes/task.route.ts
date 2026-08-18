import { Router } from "express";
import { TaskController } from "../controllers/task.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";

export function createTaskRouter(controller: TaskController): Router {
  const router = Router();

  router.post("/tasks", asyncHandler(controller.createTask));
  router.get("/tasks", asyncHandler(controller.listTasks));
  router.get("/tasks/:id/status", asyncHandler(controller.getTaskStatus));
  router.get("/tasks/:id", asyncHandler(controller.getTask));
  router.get("/tasks/:id/next", asyncHandler(controller.getNext));
  router.post("/tasks/:id/values", asyncHandler(controller.setValue));
  router.post("/tasks/:id/finalize", asyncHandler(controller.finalizeTask));
  router.post("/tasks/:id/start", asyncHandler(controller.startTask));
  router.patch("/tasks/:id/status", asyncHandler(controller.updateStatus));

  return router;
}
