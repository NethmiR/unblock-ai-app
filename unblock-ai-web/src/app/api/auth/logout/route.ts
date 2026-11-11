import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authApi } from "@/lib/api/auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

export async function POST(): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await authApi.logout(token).catch(() => undefined);
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
  return new NextResponse(null, { status: 204 });
}
