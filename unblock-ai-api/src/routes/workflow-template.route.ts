import { Router } from "express";
import { WorkflowTemplateController } from "../controllers/workflow-template.controller.js";
import { asyncHandler } from "../middlewares/async-handler.middleware.js";
import { requireAnyPermission } from "../middlewares/index.middleware.js";
import { Permission } from "../data/constants/permission.constant.js";

const BASE_PATH = "/workflow-templates";
const TEMPLATE_PATH = `${BASE_PATH}/:workflowTemplateId`;

export function createWorkflowTemplateRouter(controller: WorkflowTemplateController): Router {
  const router = Router();
  const manageWorkflowTemplates = requireAnyPermission(Permission.WORKFLOW_MANAGE);
  const readWorkflowTemplates = requireAnyPermission(Permission.WORKFLOW_MANAGE, Permission.TASK_CREATE);

  router.get(BASE_PATH, readWorkflowTemplates, asyncHandler(controller.list));
  router.post(BASE_PATH, manageWorkflowTemplates, asyncHandler(controller.createDraft));
  router.post(`${BASE_PATH}/generate`, manageWorkflowTemplates, asyncHandler(controller.generate));
  router.get(TEMPLATE_PATH, readWorkflowTemplates, asyncHandler(controller.getById));
  router.patch(TEMPLATE_PATH, manageWorkflowTemplates, asyncHandler(controller.update));
  router.post(`${TEMPLATE_PATH}/generate`, manageWorkflowTemplates, asyncHandler(controller.regenerate));
  router.post(`${TEMPLATE_PATH}/publish`, manageWorkflowTemplates, asyncHandler(controller.publish));
  router.post(`${TEMPLATE_PATH}/archive`, manageWorkflowTemplates, asyncHandler(controller.archive));
  router.post(`${TEMPLATE_PATH}/restore`, manageWorkflowTemplates, asyncHandler(controller.restore));
  router.get(`${TEMPLATE_PATH}/versions`, readWorkflowTemplates, asyncHandler(controller.listVersions));
  router.get(`${TEMPLATE_PATH}/versions/:version`, readWorkflowTemplates, asyncHandler(controller.getVersion));

  return router;
}
