import { describe, expect, it } from "vitest";
import { Permission } from "@/types/permission";
import { RoutePath, userDetailPath } from "@/lib/routing/route-path";
import { ACCOUNT_NAVIGATION, DASHBOARD_NAVIGATION } from "./dashboard-navigation";
import {
  canAccessRoute,
  findActiveNavItem,
  getAccessibleNavGroups,
  getAccessibleNavItems,
  getPageMeta,
  getRequiredPermission,
  resolveLandingRoute,
} from "./navigation-access";

const ALL_PERMISSIONS = Object.values(Permission);

describe("getAccessibleNavGroups", () => {
  it("returns only the groups whose permission the user holds, in display order", () => {
    const groups = getAccessibleNavGroups([Permission.USER_MANAGE, Permission.TASK_CREATE]);

    expect(groups.map((group) => group.permission)).toEqual([Permission.TASK_CREATE, Permission.USER_MANAGE]);
  });

  it("returns no groups for a user without permissions", () => {
    expect(getAccessibleNavGroups([])).toEqual([]);
  });

  it("covers every backend permission with exactly one group", () => {
    expect(getAccessibleNavGroups(ALL_PERMISSIONS)).toHaveLength(ALL_PERMISSIONS.length);
  });
});

describe("getAccessibleNavItems", () => {
  it("always includes the account links", () => {
    expect(getAccessibleNavItems([])).toEqual([...ACCOUNT_NAVIGATION]);
  });
});

describe("canAccessRoute", () => {
  it("gates feature routes by their group's permission", () => {
    expect(getRequiredPermission(RoutePath.WORKFLOWS_NEW)).toBe(Permission.WORKFLOW_MANAGE);
    expect(canAccessRoute([Permission.TASK_CREATE], RoutePath.WORKFLOWS_NEW)).toBe(false);
    expect(canAccessRoute([Permission.WORKFLOW_MANAGE], RoutePath.WORKFLOWS_NEW)).toBe(true);
  });

  it("gates pages nested beneath a link by that link's permission", () => {
    const nestedWorkflowPage = `${RoutePath.WORKFLOWS}/some-workflow-id`;

    expect(getRequiredPermission(nestedWorkflowPage)).toBe(Permission.WORKFLOW_MANAGE);
    expect(canAccessRoute([Permission.TASK_CREATE], nestedWorkflowPage)).toBe(false);
  });

  it("gates the organisation pages by organisation:manage and user detail pages by user:manage", () => {
    expect(getRequiredPermission(RoutePath.ORGANISATION_DESIGNATIONS)).toBe(Permission.ORGANISATION_MANAGE);
    expect(canAccessRoute([Permission.USER_MANAGE], RoutePath.ORGANISATION_FACULTIES)).toBe(false);
    expect(getRequiredPermission(userDetailPath("00000000-0000-4000-8000-000000000001"))).toBe(Permission.USER_MANAGE);
  });

  it("lets any signed-in user open ungated routes", () => {
    expect(canAccessRoute([], RoutePath.PROFILE)).toBe(true);
  });
});

describe("resolveLandingRoute", () => {
  it("prefers the task request list", () => {
    expect(resolveLandingRoute(ALL_PERMISSIONS)).toBe(RoutePath.TASKS);
  });

  it("falls back to the first accessible group's first link", () => {
    expect(resolveLandingRoute([Permission.WORKFLOW_MANAGE])).toBe(RoutePath.WORKFLOWS_NEW);
  });

  it("falls back to the profile for a user without permissions", () => {
    expect(resolveLandingRoute([])).toBe(RoutePath.PROFILE);
  });

  it("always resolves to a route the same user can open, so guards cannot loop", () => {
    const permissionSets: Permission[][] = [[], ...ALL_PERMISSIONS.map((permission) => [permission]), ALL_PERMISSIONS];

    for (const permissions of permissionSets) {
      expect(canAccessRoute(permissions, resolveLandingRoute(permissions))).toBe(true);
    }
  });
});

describe("findActiveNavItem", () => {
  const items = getAccessibleNavItems(ALL_PERMISSIONS);

  it("prefers the most specific link", () => {
    expect(findActiveNavItem(RoutePath.TASKS_NEW, items)?.href).toBe(RoutePath.TASKS_NEW);
  });

  it("matches pages nested beneath a link", () => {
    expect(findActiveNavItem(`${RoutePath.TASKS}/some-task-id`, items)?.href).toBe(RoutePath.TASKS);
  });

  it("does not match a sibling path that merely shares a prefix", () => {
    expect(findActiveNavItem(`${RoutePath.USERS}-archive`, items)).toBeNull();
  });
});

describe("getPageMeta", () => {
  it("reads the heading from the navigation config", () => {
    const [createWorkflow] = DASHBOARD_NAVIGATION[Permission.WORKFLOW_MANAGE].items;

    expect(getPageMeta(RoutePath.WORKFLOWS_NEW)).toEqual({
      title: createWorkflow.title,
      description: createWorkflow.description,
    });
  });
});
