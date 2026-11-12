"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DASHBOARD_COPY } from "@/lib/constants/ui-copy";
import { Sidebar } from "./sidebar/Sidebar";
import { Topbar } from "./topbar/Topbar";

/**
 * The dashboard frame: sidebar + top bar + the `<main>` content slot that
 * every dashboard page renders into. Owns only the mobile drawer state that
 * the sidebar and top bar share.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const sidebarId = useId();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [previousPathname, setPreviousPathname] = useState(pathname);

  // Close the mobile drawer once a link has navigated somewhere.
  if (pathname !== previousPathname) {
    setPreviousPathname(pathname);
    setIsSidebarOpen(false);
  }

  useEffect(() => {
    if (!isSidebarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSidebarOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isSidebarOpen]);

  return (
    <div className="font-admin flex min-h-screen bg-bg">
      <Sidebar id={sidebarId} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {isSidebarOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={DASHBOARD_COPY.closeNavigation}
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 cursor-default bg-ink/40 lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-4 p-3 sm:p-4">
        <Topbar sidebarId={sidebarId} isSidebarOpen={isSidebarOpen} onOpenSidebar={() => setIsSidebarOpen(true)} />
        <main className="flex min-h-0 flex-1 flex-col rounded-card border border-line-admin bg-surface p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
