import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const email: unknown = body?.email;
  const password: unknown = body?.password;

  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  try {
    const result = await authApi.login({ email, password }, request.headers.get("user-agent"));

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
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 502 });
  }
}
