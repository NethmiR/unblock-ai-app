"use client";
import { Icon } from "@/components/ui/icons/Icon";
import { APP_CONFIG } from "@/lib/config/app.config";
import { DASHBOARD_COPY } from "@/lib/constants/ui-copy";
import { useDashboardNavigation } from "@/lib/hooks/useDashboardNavigation";
import { IconName } from "@/types/icon";
import { TopbarUserSummary } from "./TopbarUserSummary";

interface TopbarProps {
  sidebarId: string;
  isSidebarOpen: boolean;
  onOpenSidebar: () => void;
}

/** Page heading (from the active nav item) on the left, the signed-in user on the right. */
export function Topbar({ sidebarId, isSidebarOpen, onOpenSidebar }: TopbarProps) {
  const { activeItem } = useDashboardNavigation();

  return (
    <header className="flex flex-none items-center gap-3 rounded-card border border-line-admin bg-surface px-4 py-3 sm:px-6">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label={DASHBOARD_COPY.openNavigation}
        aria-controls={sidebarId}
        aria-expanded={isSidebarOpen}
        className="rounded-control p-1.5 text-muted hover:bg-bg hover:text-ink lg:hidden"
      >
        <Icon name={IconName.MENU} />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[18px] font-bold tracking-tight text-accent">
          {activeItem?.title ?? APP_CONFIG.name}
        </h1>
        {activeItem && <p className="truncate text-[13px] text-muted">{activeItem.description}</p>}
      </div>

      <TopbarUserSummary />
    </header>
  );
}
