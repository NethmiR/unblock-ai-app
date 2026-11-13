import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import { canAccessRoute } from "@/lib/navigation/navigation-access";
import { RoutePath } from "@/lib/routing/route-path";
import { initialsOf } from "@/lib/utils/initials";
import { SESSION_COOKIE_NAME } from "./session-cookie";
import type { CurrentSession } from "@/types/auth";

/**
 * Data Access Layer for the signed-in user (server-only: reads the httpOnly
 * session cookie). Wrapped in React `cache` so the dashboard layout, the page
 * guard, and any nested Server Component share ONE `/auth/me` call per request.
 */
export const getSession = cache(async (): Promise<CurrentSession | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { user, session } = await authApi.me(token);
    return { user, sessionId: session.id, initials: initialsOf(user.full_name) };
  } catch {
    return null;
  }
});

/** The session, or a redirect to the login page. */
export async function requireSession(): Promise<CurrentSession> {
  const session = await getSession();
  if (!session) redirect(RoutePath.LOGIN);
  return session;
}

/**
 * The session, provided the user may open `route` (per the navigation
 * config). Otherwise redirects to the dashboard root, which sends the user to
 * a landing page they CAN open - see `resolveLandingRoute`.
 */
export async function requireRouteAccess(route: RoutePath): Promise<CurrentSession> {
  const session = await requireSession();
  if (!canAccessRoute(session.user.permissions, route)) redirect(RoutePath.DASHBOARD);
  return session;
}
