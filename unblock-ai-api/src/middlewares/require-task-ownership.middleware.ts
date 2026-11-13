import type { Request, RequestHandler, Response } from "express";
import { asyncHandler } from "./async-handler.middleware.js";
import { taskNotFound } from "../errors/task.error.js";
import { requireAuthContext } from "../utils/http/auth-context.util.js";
import type { TaskService } from "../services/task.service.js";

export interface RequireTaskOwnershipOptions {
  taskService: Pick<TaskService, "isOwnedBy">;
}

export function createRequireTaskOwnership({ taskService }: RequireTaskOwnershipOptions): RequestHandler {
  return asyncHandler(async (req: Request, _res: Response, next) => {
    const taskId = req.params.id as string;
    const { user } = requireAuthContext(req);
    if (!(await taskService.isOwnedBy(taskId, user.id))) throw taskNotFound(taskId);
    next();
  });
}
