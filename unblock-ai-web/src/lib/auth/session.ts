/**
 * Reads the real session from the httpOnly cookie a Route Handler sets on
 * login (`app/api/auth/login/route.ts`). Server Component / Route Handler
 * only - it calls `cookies()`, which throws outside a request scope.
 *
 * Replaces the mock this file used to export (formerly marked "REPLACE
 * BEFORE ANY DEPLOYMENT"). `getRequesterContext()` keeps its exact shape -
 * the selector agent depends on these keys to skip clarifying questions; see
 * Finding 0.4 in docs/auth-and-deletion-tracking-phase-plan.md.
 */
import { cookies } from "next/headers";
import { authApi } from "@/lib/api/auth";
import { SESSION_COOKIE_NAME } from "./session-cookie";
import type { AuthUser } from "@/types/auth";

export interface Session {
  user: AuthUser;
  initials: string;
}

/**
 * `null` covers both "no cookie" and "cookie present but rejected" - an
 * expired token, a tampered one, or a transient failure reaching the API.
 * Any of those means "render as signed out", not a thrown error.
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { user } = await authApi.me(token);
    return { user, initials: initialsOf(user.full_name) };
  } catch {
    return null;
  }
}

/**
 * Context handed to the selector so it can skip questions it can already
 * answer. When a requester's faculty is known, "Which faculty are you in?"
 * is a question the system should never have to ask.
 */
export function getRequesterContext(session: Session) {
  return {
    faculty: session.user.faculty,
    department: session.user.department,
    actor_type: "staff",
  };
}

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}
