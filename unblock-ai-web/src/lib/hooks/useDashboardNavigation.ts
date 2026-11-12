"use client";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/components/providers/SessionProvider";
import {
  findActiveNavItem,
  getAccessibleNavGroups,
  getAccessibleNavItems,
} from "@/lib/navigation/navigation-access";
import type { NavGroup, NavItem } from "@/types/navigation";

interface DashboardNavigation {
  /** The permission-gated groups this user may see, in display order. */
  groups: NavGroup[];
  /** The link matching the current URL, if any. */
  activeItem: NavItem | null;
}

/**
 * The current user's sidebar, plus which link the URL points at. Lives in a
 * hook (not the layout) because layouts do not re-render on navigation - only
 * Client Components see the live `usePathname()`.
 */
export function useDashboardNavigation(): DashboardNavigation {
  const pathname = usePathname();
  const { permissions } = useCurrentUser();

  return useMemo(
    () => ({
      groups: getAccessibleNavGroups(permissions),
      activeItem: findActiveNavItem(pathname, getAccessibleNavItems(permissions)),
    }),
    [pathname, permissions],
  );
}
