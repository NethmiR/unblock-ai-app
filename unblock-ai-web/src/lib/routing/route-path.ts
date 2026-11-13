export enum RoutePath {
  HOME = "/",
  LOGIN = "/login",
  DASHBOARD = "/dashboard",
  TASKS = "/dashboard/tasks",
  TASKS_NEW = "/dashboard/tasks/new",
  APPROVALS = "/dashboard/approvals",
  APPROVALS_HISTORY = "/dashboard/approvals/history",
  WORKFLOWS = "/dashboard/workflows",
  WORKFLOWS_NEW = "/dashboard/workflows/new",
  USERS = "/dashboard/users",
  USERS_NEW = "/dashboard/users/new",
  ORGANISATION_FACULTIES = "/dashboard/organisation/faculties",
  ORGANISATION_DIVISIONS = "/dashboard/organisation/divisions",
  ORGANISATION_DESIGNATIONS = "/dashboard/organisation/designations",
  PROFILE = "/dashboard/profile",
}

export function userDetailPath(userId: string): string {
  return `${RoutePath.USERS}/${encodeURIComponent(userId)}`;
}

export const TASK_STEP_QUERY_PARAMETER = "step";

export function taskDetailPath(taskId: string, stepId?: string): string {
  const path = `${RoutePath.TASKS}/${encodeURIComponent(taskId)}`;
  return stepId === undefined ? path : `${path}?${new URLSearchParams({ [TASK_STEP_QUERY_PARAMETER]: stepId })}`;
}

export function approvalDetailPath(taskId: string, stepId: string): string {
  return `${RoutePath.APPROVALS}/${encodeURIComponent(taskId)}/${encodeURIComponent(stepId)}`;
}

export const WORKFLOW_TEMPLATE_VERSION_QUERY_PARAMETER = "version";

export function workflowTemplateDetailPath(workflowTemplateId: string, version?: number): string {
  const path = `${RoutePath.WORKFLOWS}/${encodeURIComponent(workflowTemplateId)}`;
  return version === undefined ? path : `${path}?${new URLSearchParams({ [WORKFLOW_TEMPLATE_VERSION_QUERY_PARAMETER]: String(version) })}`;
}

/**
 * Pre-revamp screens, parked under `/old` until each feature is re-plugged
 * into the dashboard layout. Delete an entry once its screen is migrated.
 */
export enum LegacyRoutePath {
  ACCOUNT = "/old/account",
}

/** This app's own Route Handlers (not the backend API). */
export enum InternalApiPath {
  LOGIN = "/api/auth/login",
  LOGOUT = "/api/auth/logout",
}

export const NEXT_QUERY_PARAMETER = "next";

export function safeRedirectPath(candidate: string | null, fallback: RoutePath): string {
  return candidate && candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : fallback;
}

export function loginPathFor(next: string): string {
  return `${RoutePath.LOGIN}?${new URLSearchParams({ [NEXT_QUERY_PARAMETER]: next })}`;
}

/** True when `pathname` is `route` itself or any page nested beneath it. */
export function isWithinRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}
