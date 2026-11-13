import { Router } from "express";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAnyPermission } from "../middlewares/index.middleware.js";
import { Permission } from "../data/constants/permission.constant.js";
import { APPROVER_ROUTE_SEGMENT } from "../data/constants/approval.constant.js";
import type { ApproverController } from "../controllers/approver.controller.js";

const { ROOT, APPROVALS, PENDING, HISTORY, SUMMARY, STEPS, DECISION } = APPROVER_ROUTE_SEGMENT;
const BASE = `/${ROOT}/${APPROVALS}`;
const ASSIGNMENT = `${BASE}/:taskId/${STEPS}/:stepId`;

export function createApproverRouter(controller: ApproverController): Router {
  const router = Router();
  const approvers = requireAnyPermission(Permission.TASK_APPROVE);

  router.get(`${BASE}/${PENDING}`, approvers, asyncHandler(controller.listPending));
  router.get(`${BASE}/${HISTORY}`, approvers, asyncHandler(controller.listHistory));
  router.get(`${BASE}/${SUMMARY}`, approvers, asyncHandler(controller.summary));
  router.get(ASSIGNMENT, approvers, asyncHandler(controller.getAssignment));
  router.post(`${ASSIGNMENT}/${DECISION}`, approvers, asyncHandler(controller.decide));

  return router;
}
