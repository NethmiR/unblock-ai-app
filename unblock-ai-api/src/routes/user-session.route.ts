import { Router } from "express";
import { UserSessionController } from "../controllers/user-session.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAuthentication } from "../middlewares/index.middleware.js";

export function createUserSessionRouter(controller: UserSessionController): Router {
  const router = Router();
  const authenticated = requireAuthentication();

  router.get("/auth/sessions", authenticated, asyncHandler(controller.list));
  router.delete("/auth/sessions/others", authenticated, asyncHandler(controller.revokeOthers));
  router.delete("/auth/sessions/:sessionId", authenticated, asyncHandler(controller.revoke));

  return router;
}
