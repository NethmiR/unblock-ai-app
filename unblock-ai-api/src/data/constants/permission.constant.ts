export enum Permission {
  WORKFLOW_MANAGE = "workflow:manage",
  TASK_CREATE = "task:create",
  TASK_APPROVE = "task:approve",
  USER_MANAGE = "user:manage",
}

export const PERMISSIONS: readonly Permission[] = Object.values(Permission);
