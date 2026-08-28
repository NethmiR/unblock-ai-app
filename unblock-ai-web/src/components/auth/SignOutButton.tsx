"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  /**
   * Where to land after the cookie is cleared. The two portals have separate
   * sign-in pages, so an admin must not be dropped on the requester login and
   * vice versa - each top bar passes its own.
   */
  redirectTo: string;
}

export function SignOutButton({ redirectTo }: Props) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);

  async function handleSignOut() {
    setIsBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace(redirectTo);
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
