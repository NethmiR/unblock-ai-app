"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { InternalApiPath, RoutePath } from "@/lib/routing/route-path";

/** Ends the session server-side, then returns to the login page. */
export function useSignOut() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const signOut = useCallback(async () => {
    setIsSigningOut(true);
    try {
      await fetch(InternalApiPath.LOGOUT, { method: "POST" });
    } finally {
      router.replace(RoutePath.LOGIN);
      router.refresh();
    }
  }, [router]);

  return { signOut, isSigningOut };
}
