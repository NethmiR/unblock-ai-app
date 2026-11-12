"use client";
import { AUTH_COPY } from "@/lib/constants/ui-copy";
import { useSignOut } from "@/lib/hooks/useSignOut";

export function SignOutButton() {
  const { signOut, isSigningOut } = useSignOut();

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={isSigningOut}
      className="text-[12.5px] font-medium text-muted transition-colors hover:text-ink disabled:text-faint"
    >
      {isSigningOut ? AUTH_COPY.signingOut : AUTH_COPY.signOut}
    </button>
  );
}
