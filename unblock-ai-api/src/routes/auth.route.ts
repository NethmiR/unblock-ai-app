import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAuthentication } from "../middlewares/index.middleware.js";

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();
  const authenticated = requireAuthentication();

  router.post("/auth/login", asyncHandler(controller.login));
  router.get("/auth/me", authenticated, asyncHandler(controller.me));
  router.post("/auth/logout", authenticated, asyncHandler(controller.logout));

  return router;
}
