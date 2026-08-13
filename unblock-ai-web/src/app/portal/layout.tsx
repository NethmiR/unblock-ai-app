import type { ReactNode } from "react";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <div className="font-portal min-h-screen">{children}</div>;
}
