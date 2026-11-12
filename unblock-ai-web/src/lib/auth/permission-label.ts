import { Permission } from "@/types/permission";

export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.WORKFLOW_MANAGE]: "Workflow management",
  [Permission.TASK_CREATE]: "Task creation",
  [Permission.TASK_APPROVE]: "Task approval",
  [Permission.USER_MANAGE]: "User management",
  [Permission.ORGANISATION_MANAGE]: "Organisation management",
};

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  [Permission.TASK_CREATE]: "Find a workflow and submit task requests.",
  [Permission.TASK_APPROVE]: "Act on approval steps assigned to them.",
  [Permission.WORKFLOW_MANAGE]: "Create, edit and retire workflow templates.",
  [Permission.USER_MANAGE]: "Create users and manage their affiliations.",
  [Permission.ORGANISATION_MANAGE]: "Configure faculties, departments, divisions and designations.",
};
