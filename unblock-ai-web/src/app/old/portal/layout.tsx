import type { ReactNode } from "react";
import { PortalTopBar } from "@/components/portal/TopBar";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="font-portal min-h-screen">
      <PortalTopBar />
      {children}
    </div>
  );
}
