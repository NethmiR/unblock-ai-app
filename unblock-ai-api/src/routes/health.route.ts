import { Router } from "express";
import { HealthController } from "../controllers/health.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";

export function createHealthRouter(controller: HealthController): Router {
  const router = Router();
  router.get("/health", asyncHandler(controller.check));
  return router;
}
