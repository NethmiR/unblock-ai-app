import { Router } from "express";
import { DesignationController } from "../controllers/designation.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAnyPermission, requireAuthentication } from "../middlewares/index.middleware.js";
import { Permission } from "../data/constants/permission.constant.js";

export function createDesignationRouter(controller: DesignationController): Router {
  const router = Router();
  const authenticated = requireAuthentication();
  const manageOrganisation = requireAnyPermission(Permission.ORGANISATION_MANAGE);

  router.get("/designations", authenticated, asyncHandler(controller.list));
  router.post("/designations", manageOrganisation, asyncHandler(controller.create));
  router.get("/designations/:designationId", authenticated, asyncHandler(controller.getById));
  router.patch("/designations/:designationId", manageOrganisation, asyncHandler(controller.update));
  router.delete("/designations/:designationId", manageOrganisation, asyncHandler(controller.delete));
  router.post("/designations/:designationId/archive", manageOrganisation, asyncHandler(controller.archive));
  router.post("/designations/:designationId/restore", manageOrganisation, asyncHandler(controller.restore));

  return router;
}
