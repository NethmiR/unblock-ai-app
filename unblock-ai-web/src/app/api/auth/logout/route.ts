import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth/token";

// Stateless session (D-3): there is nothing server-side to invalidate.
// Clearing the cookie is the entire operation - the API's own
// `POST /auth/logout` is a no-op `204` for the same reason, so it is not
// worth the extra round trip to call it here too.
export async function POST(): Promise<Response> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return new NextResponse(null, { status: 204 });
}
