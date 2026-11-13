"use client";
import Link from "next/link";
import { BrandMark } from "@/components/ui/BrandMark";
import { Icon } from "@/components/ui/icons/Icon";
import { APP_CONFIG } from "@/lib/config/app.config";
import { DASHBOARD_COPY } from "@/lib/constants/ui-copy";
import { useDashboardNavigation } from "@/lib/hooks/useDashboardNavigation";
import { useNavBadgeCounts } from "@/lib/hooks/useNavBadgeCounts";
import { ACCOUNT_NAVIGATION } from "@/lib/navigation/dashboard-navigation";
import { RoutePath } from "@/lib/routing/route-path";
import { cn } from "@/lib/utils/cn";
import { IconName } from "@/types/icon";
import { SidebarNavGroup } from "./SidebarNavGroup";
import { SidebarNavLink } from "./SidebarNavLink";
import { SidebarSection } from "./SidebarSection";
import { SidebarSignOutButton } from "./SidebarSignOutButton";

interface SidebarProps {
  id: string;
  /** Only meaningful below the `lg` breakpoint; the sidebar is always shown above it. */
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Built entirely from `DASHBOARD_NAVIGATION`, filtered by the signed-in user's
 * permissions - a group the user cannot use is never rendered.
 */
export function Sidebar({ id, isOpen, onClose }: SidebarProps) {
  const { groups, activeItem } = useDashboardNavigation();
  const activeHref = activeItem?.href ?? null;
  const badgeCounts = useNavBadgeCounts();

  return (
    <aside
      id={id}
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-none flex-col border-r border-line-admin bg-surface transition-transform duration-200",
        "lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex h-[72px] flex-none items-center justify-between gap-3 px-5">
        <Link href={RoutePath.DASHBOARD} className="flex items-center gap-3">
          <BrandMark />
          <span className="text-[15.5px] font-bold tracking-tight text-ink">{APP_CONFIG.name}</span>
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label={DASHBOARD_COPY.closeNavigation}
          className="rounded-control p-1.5 text-muted hover:bg-bg hover:text-ink lg:hidden"
        >
          <Icon name={IconName.CLOSE} />
        </button>
      </div>

      <nav aria-label={DASHBOARD_COPY.navigationLabel} className="flex-1 overflow-y-auto px-3 pb-6 pt-2">
        {groups.length > 0 && (
          <SidebarSection label={DASHBOARD_COPY.functionsSectionLabel}>
            {groups.map((group) => (
              <li key={group.permission}>
                <SidebarNavGroup group={group} activeHref={activeHref} badgeCounts={badgeCounts} />
              </li>
            ))}
          </SidebarSection>
        )}

        <SidebarSection label={DASHBOARD_COPY.accountSectionLabel}>
          {ACCOUNT_NAVIGATION.map((item) => (
            <li key={item.href}>
              <SidebarNavLink item={item} isActive={item.href === activeHref} />
            </li>
          ))}
          <li>
            <SidebarSignOutButton />
          </li>
        </SidebarSection>
      </nav>
    </aside>
  );
}
