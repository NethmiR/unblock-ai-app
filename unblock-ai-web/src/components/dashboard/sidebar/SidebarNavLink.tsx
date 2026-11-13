import Link from "next/link";
import { Icon } from "@/components/ui/icons/Icon";
import type { NavBadge } from "@/lib/hooks/useNavBadgeCounts";
import type { NavItem } from "@/types/navigation";
import { sidebarRowClass } from "./sidebar-row";

interface SidebarNavLinkProps {
  item: NavItem;
  isActive: boolean;
  badge?: NavBadge | null;
}

export function SidebarNavLink({ item, isActive, badge = null }: SidebarNavLinkProps) {
  return (
    <Link href={item.href} aria-current={isActive ? "page" : undefined} className={sidebarRowClass({ isActive })}>
      <Icon name={item.icon} className="h-[18px] w-[18px]" />
      <span className="flex-1 truncate">{item.label}</span>
      {badge && (
        <span className="min-w-5 rounded-pill bg-accent px-1.5 py-px text-center text-[11px] font-bold leading-4 text-white">
          <span aria-hidden="true">{badge.count}</span>
          <span className="sr-only">{badge.label}</span>
        </span>
      )}
    </Link>
  );
}
