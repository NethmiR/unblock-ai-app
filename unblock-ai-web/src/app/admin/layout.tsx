import type { ReactNode } from "react";
import { TopBar } from "@/components/admin/TopBar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="font-admin min-h-screen">
      <TopBar />
      {children}
    </div>
  );
}
