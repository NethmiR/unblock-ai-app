import Link from "next/link";
import { Icon } from "@/components/ui/icons/Icon";
import type { NavItem } from "@/types/navigation";
import { sidebarRowClass } from "./sidebar-row";

interface SidebarNavLinkProps {
  item: NavItem;
  isActive: boolean;
}

export function SidebarNavLink({ item, isActive }: SidebarNavLinkProps) {
  return (
    <Link href={item.href} aria-current={isActive ? "page" : undefined} className={sidebarRowClass({ isActive })}>
      <Icon name={item.icon} className="h-[18px] w-[18px]" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
