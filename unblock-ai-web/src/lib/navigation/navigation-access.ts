import { isWithinRoute, type RoutePath } from "@/lib/routing/route-path";
import type { Permission } from "@/types/permission";
import type { NavGroup, NavItem, PageMeta } from "@/types/navigation";
import {
  ACCOUNT_NAVIGATION,
  DASHBOARD_NAVIGATION,
  FALLBACK_LANDING_ROUTE,
  PREFERRED_LANDING_ROUTE,
} from "./dashboard-navigation";

/**
 * Pure navigation rules, shared by Server Components (route guards, landing
 * redirect, metadata) and Client Components (sidebar, top bar). Nothing here
 * touches React, cookies, or the network, so it is unit-testable as-is.
 */

const ALL_NAV_GROUPS: readonly NavGroup[] = Object.values(DASHBOARD_NAVIGATION);

const ALL_NAV_ITEMS: readonly NavItem[] = [
  ...ALL_NAV_GROUPS.flatMap((group) => group.items),
  ...ACCOUNT_NAVIGATION,
];

const GATED_NAV_ITEMS: readonly { item: NavItem; permission: Permission }[] = ALL_NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ item, permission: group.permission })),
);

export function getAccessibleNavGroups(permissions: readonly Permission[]): NavGroup[] {
  return ALL_NAV_GROUPS.filter((group) => permissions.includes(group.permission));
}

/** Every link the user may see: their permitted groups' items plus the account links. */
export function getAccessibleNavItems(permissions: readonly Permission[]): NavItem[] {
  return [...getAccessibleNavGroups(permissions).flatMap((group) => group.items), ...ACCOUNT_NAVIGATION];
}

/**
 * The permission a path needs, inherited from the nav link it sits under -
 * so a future `/dashboard/workflows/<id>` is gated by "Workflows" without a
 * nav entry of its own. `null` means any signed-in user may open it.
 */
export function getRequiredPermission(pathname: string): Permission | null {
  const gated = findActiveNavItem(
    pathname,
    GATED_NAV_ITEMS.map(({ item }) => item),
  );
  return GATED_NAV_ITEMS.find(({ item }) => item === gated)?.permission ?? null;
}

export function canAccessRoute(permissions: readonly Permission[], pathname: string): boolean {
  const required = getRequiredPermission(pathname);
  return required === null || permissions.includes(required);
}

/**
 * The page a user is sent to after sign-in. Always a route `canAccessRoute`
 * accepts for the same permissions, so it can never cause a redirect loop.
 */
export function resolveLandingRoute(permissions: readonly Permission[]): RoutePath {
  if (canAccessRoute(permissions, PREFERRED_LANDING_ROUTE)) return PREFERRED_LANDING_ROUTE;
  return getAccessibleNavGroups(permissions)[0]?.items[0]?.href ?? FALLBACK_LANDING_ROUTE;
}

/**
 * The link `pathname` belongs to. The longest matching `href` wins, so
 * `/dashboard/tasks/new` resolves to "Create new" rather than "View existing",
 * while a future `/dashboard/tasks/123` still resolves to "View existing".
 */
export function findActiveNavItem(pathname: string, items: readonly NavItem[]): NavItem | null {
  return items.reduce<NavItem | null>((best, item) => {
    if (!isWithinRoute(pathname, item.href)) return best;
    return !best || item.href.length > best.href.length ? item : best;
  }, null);
}

export function getPageMeta(route: RoutePath): PageMeta | null {
  const item = ALL_NAV_ITEMS.find((candidate) => candidate.href === route);
  return item ? { title: item.title, description: item.description } : null;
}
