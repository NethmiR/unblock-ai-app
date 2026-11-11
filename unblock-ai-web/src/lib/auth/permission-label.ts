import { Permission } from "@/types/permission";

export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.WORKFLOW_MANAGE]: "Workflow management",
  [Permission.TASK_CREATE]: "Task creation",
  [Permission.TASK_APPROVE]: "Task approval",
  [Permission.USER_MANAGE]: "User management",
};
