import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/token";
import type { AuthAudience } from "@/types/auth";

const AUDIENCES: AuthAudience[] = ["admin", "portal"];

/**
 * Sets the session cookie on THIS app's own origin (D-4) rather than letting
 * the API set it directly - that is what lets Server Components and `proxy.ts`
 * read the session, and it is why the token never reaches the browser as
 * anything other than an httpOnly `Set-Cookie`.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const audience = body?.audience;
  const username = body?.username;
  const password = body?.password;

  if (!AUDIENCES.includes(audience) || typeof username !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "audience, username and password are required" }, { status: 400 });
  }

  try {
    const result = await authApi.login({ audience, username, password });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(result.expires_at),
    });

    return NextResponse.json({ user: result.user });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 502 });
  }
}
