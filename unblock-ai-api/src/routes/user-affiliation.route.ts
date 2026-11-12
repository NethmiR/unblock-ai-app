import { Router } from "express";
import { UserAffiliationController } from "../controllers/user-affiliation.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAnyPermission, requireAuthentication } from "../middlewares/index.middleware.js";
import { Permission } from "../data/constants/permission.constant.js";

export function createUserAffiliationRouter(controller: UserAffiliationController): Router {
  const router = Router();
  const authenticated = requireAuthentication();
  const manageUsers = requireAnyPermission(Permission.USER_MANAGE);
  const viewUnitMembers = requireAnyPermission(Permission.USER_MANAGE, Permission.ORGANISATION_MANAGE);

  router.get("/auth/me/affiliations", authenticated, asyncHandler(controller.getForCurrentUser));
  router.get("/users/:userId/affiliations", manageUsers, asyncHandler(controller.getForUser));
  router.put("/users/:userId/affiliations", manageUsers, asyncHandler(controller.replaceForUser));
  router.get("/organisational-units/:unitId/members", viewUnitMembers, asyncHandler(controller.listUnitMembers));

  return router;
}
