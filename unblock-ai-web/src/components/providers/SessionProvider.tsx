"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { AuthenticatedUser, CurrentSession } from "@/types/auth";
import type { Permission } from "@/types/permission";

/**
 * The signed-in user, shared with every Client Component under the dashboard
 * layout. The layout resolves the session on the server (via the cached DAL
 * in `lib/auth/session.ts`) and hands it here once - no client refetch, and
 * the auth token itself never reaches the browser.
 *
 * Server Components should keep calling `getSession()` directly; it is
 * request-cached, so that costs no extra backend call.
 */
const SessionContext = createContext<CurrentSession | null>(null);

interface SessionProviderProps {
  session: CurrentSession;
  children: ReactNode;
}

export function SessionProvider({ session, children }: SessionProviderProps) {
  return <SessionContext value={session}>{children}</SessionContext>;
}

export function useSession(): CurrentSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used within a SessionProvider");
  return session;
}

export function useCurrentUser(): AuthenticatedUser {
  return useSession().user;
}

export function useHasPermission(permission: Permission): boolean {
  return useCurrentUser().permissions.includes(permission);
}
