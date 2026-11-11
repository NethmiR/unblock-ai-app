import { cookies } from "next/headers";
import { authApi } from "@/lib/api/auth";
import { SESSION_COOKIE_NAME } from "./session-cookie";
import { RequesterActorType } from "@/types/selection";
import type { AuthenticatedUser } from "@/types/auth";

export interface Session {
  user: AuthenticatedUser;
  sessionId: string;
  initials: string;
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { user, session } = await authApi.me(token);
    return { user, sessionId: session.id, initials: initialsOf(user.full_name) };
  } catch {
    return null;
  }
}

export function getRequesterContext(): Record<string, unknown> {
  return { actor_type: RequesterActorType.STAFF };
}

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}
