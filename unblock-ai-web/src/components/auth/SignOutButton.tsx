"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RoutePath } from "@/lib/routing/route-path";

export function SignOutButton() {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);

  async function handleSignOut() {
    setIsBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace(RoutePath.LOGIN);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isBusy}
      className="text-[12.5px] font-medium text-muted transition-colors hover:text-ink disabled:text-faint"
    >
      {isBusy ? "Signing out…" : "Sign out"}
    </button>
  );
}
