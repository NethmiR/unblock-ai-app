import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/token";

// `middleware.ts` was deprecated and renamed `proxy.ts` in Next.js 16 - same
// file convention, same behaviour, new name and export. See
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
export const config = { matcher: ["/admin/:path*", "/portal/:path*"] };

/**
 * Route guard for the web app. This is UX, not security - the real boundary
 * is the API's `requireAuth()`/`requireRole()` guards from Phase 4. A forged
 * cookie here just bounces the visitor to a login page; it is the API that
 * would reject the (missing, since there is no valid token to forward)
 * Authorization header on every subsequent call.
 *
 * Verifies the signature and expiry rather than just checking the cookie
 * exists - a bare presence check is defeated by setting any junk cookie
 * value with the right name.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // The login pages themselves live under /portal/:path*, which the matcher
  // above also covers - without this they would redirect to themselves.
  if (pathname === "/login" || pathname === "/portal/login") {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_TOKEN_SECRET;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = token && secret ? verifySessionToken(token, secret) : null;

  if (pathname.startsWith("/admin")) {
    if (!payload) return redirectTo(request, "/login", pathname);
    if (payload.aud !== "admin") return redirectTo(request, "/portal");
  }

  if (pathname.startsWith("/portal")) {
    if (!payload) return redirectTo(request, "/portal/login", pathname);
    // A valid admin session previewing the requester surface is allowed
    // through deliberately - see Phase 5 §5.3 of the phase plan.
  }

  return NextResponse.next();
}

function redirectTo(request: NextRequest, path: string, next?: string): NextResponse {
  const url = new URL(path, request.url);
  if (next) url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}
