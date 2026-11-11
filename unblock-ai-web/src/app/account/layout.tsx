import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="font-admin min-h-screen bg-bg">
      <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-line-admin bg-surface px-8">
        <div className="flex items-center gap-3.5">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-ink text-xs font-bold text-white">
            U
          </div>
          <div className="text-[15.5px] font-bold tracking-tight">Unblock AI</div>
        </div>
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}
