import { Router } from "express";
import { OrganisationalUnitController } from "../controllers/organisational-unit.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAnyPermission, requireAuthentication } from "../middlewares/index.middleware.js";
import { Permission } from "../data/constants/permission.constant.js";

export function createOrganisationalUnitRouter(controller: OrganisationalUnitController): Router {
  const router = Router();
  const authenticated = requireAuthentication();
  const manageOrganisation = requireAnyPermission(Permission.ORGANISATION_MANAGE);

  router.get("/organisational-units", authenticated, asyncHandler(controller.list));
  router.post("/organisational-units", manageOrganisation, asyncHandler(controller.create));
  router.get("/organisational-units/:unitId", authenticated, asyncHandler(controller.getById));
  router.patch("/organisational-units/:unitId", manageOrganisation, asyncHandler(controller.update));
  router.delete("/organisational-units/:unitId", manageOrganisation, asyncHandler(controller.delete));
  router.post("/organisational-units/:unitId/archive", manageOrganisation, asyncHandler(controller.archive));
  router.post("/organisational-units/:unitId/restore", manageOrganisation, asyncHandler(controller.restore));

  return router;
}
