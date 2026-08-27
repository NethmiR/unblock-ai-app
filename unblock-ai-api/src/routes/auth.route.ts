import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();

  router.post("/auth/login", asyncHandler(controller.login));
  router.get("/auth/me", asyncHandler(controller.me));
  router.post("/auth/logout", asyncHandler(controller.logout));

  return router;
}
