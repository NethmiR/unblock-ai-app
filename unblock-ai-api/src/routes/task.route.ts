import { Router } from "express";
import { TaskController } from "../controllers/task.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAuth } from "../middlewares/index.middleware.js";

export function createTaskRouter(controller: TaskController): Router {
  const router = Router();
  const auth = requireAuth();

  router.post("/tasks", auth, asyncHandler(controller.createTask));
  router.get("/tasks", auth, asyncHandler(controller.listTasks));
  router.get("/tasks/:id/status", auth, asyncHandler(controller.getTaskStatus));
  router.get("/tasks/:id", auth, asyncHandler(controller.getTask));
  router.get("/tasks/:id/next", auth, asyncHandler(controller.getNext));
  router.post("/tasks/:id/values", auth, asyncHandler(controller.setValue));
  router.post("/tasks/:id/finalize", auth, asyncHandler(controller.finalizeTask));
  router.post("/tasks/:id/start", auth, asyncHandler(controller.startTask));
  router.patch("/tasks/:id/status", auth, asyncHandler(controller.updateStatus));
  router.delete("/tasks/:id", auth, asyncHandler(controller.deleteTask));

  return router;
}
