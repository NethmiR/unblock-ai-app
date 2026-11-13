"use client";
import { useId, useState } from "react";
import { Icon } from "@/components/ui/icons/Icon";
import { cn } from "@/lib/utils/cn";
import { IconName } from "@/types/icon";
import type { RoutePath } from "@/lib/routing/route-path";
import type { NavBadgeCounts } from "@/lib/hooks/useNavBadgeCounts";
import type { NavGroup } from "@/types/navigation";
import { SidebarNavLink } from "./SidebarNavLink";
import { sidebarRowClass } from "./sidebar-row";

interface SidebarNavGroupProps {
  group: NavGroup;
  activeHref: RoutePath | null;
  badgeCounts: NavBadgeCounts;
}

/** A collapsible permission group. Opens itself whenever the URL moves into it. */
export function SidebarNavGroup({ group, activeHref, badgeCounts }: SidebarNavGroupProps) {
  const panelId = useId();
  const containsActive = group.items.some((item) => item.href === activeHref);
  const [isExpanded, setIsExpanded] = useState(containsActive);
  const [previousContainsActive, setPreviousContainsActive] = useState(containsActive);

  // Adjust state during render (not in an effect) when navigation enters this group.
  if (containsActive !== previousContainsActive) {
    setPreviousContainsActive(containsActive);
    if (containsActive) setIsExpanded(true);
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className={sidebarRowClass({ isEmphasized: containsActive })}
      >
        <Icon name={group.icon} />
        <span className="flex-1 truncate">{group.label}</span>
        <Icon
          name={IconName.CHEVRON_DOWN}
          className={cn("h-4 w-4 transition-transform duration-200", isExpanded && "rotate-180")}
        />
      </button>

      <ul id={panelId} className={cn("mt-0.5 flex-col gap-0.5 pl-4", isExpanded ? "flex" : "hidden")}>
        {group.items.map((item) => (
          <li key={item.href}>
            <SidebarNavLink
              item={item}
              isActive={item.href === activeHref}
              badge={item.badgeKey === undefined ? null : badgeCounts[item.badgeKey]}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
