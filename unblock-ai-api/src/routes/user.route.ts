import { Router } from "express";
import { UserController } from "../controllers/user.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAnyPermission } from "../middlewares/index.middleware.js";
import { Permission } from "../data/constants/permission.constant.js";

export function createUserRouter(controller: UserController): Router {
  const router = Router();
  const manageUsers = requireAnyPermission(Permission.USER_MANAGE);

  router.post("/users", manageUsers, asyncHandler(controller.create));
  router.get("/users", manageUsers, asyncHandler(controller.list));
  router.get("/users/:userId", manageUsers, asyncHandler(controller.getById));

  return router;
}
