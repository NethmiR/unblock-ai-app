import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { loginPathFor } from "@/lib/routing/route-path";

/**
 * Optimistic cookie check only. The real session + permission checks run in
 * the Data Access Layer (`lib/auth/session.ts`) on every dashboard page.
 */
export const config = { matcher: ["/dashboard/:path*", "/old/:path*"] };

export function proxy(request: NextRequest): NextResponse {
  if (request.cookies.has(SESSION_COOKIE_NAME)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(new URL(loginPathFor(`${pathname}${search}`), request.url));
}
