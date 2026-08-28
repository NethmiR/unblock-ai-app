import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth/token";

const UPSTREAM_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

/**
 * Forwards every `/api/proxy/*` call to the real backend, attaching the
 * bearer token read from the httpOnly session cookie along the way.
 *
 * This is what `client.ts`'s `apiRequest` relies on to keep every existing
 * client-component call site working after Phase 4 added `requireAuth()`/
 * `requireRole()` guards to the API: a browser fetch can never read an
 * httpOnly cookie to set its own Authorization header, but this Route
 * Handler - always server-side - can.
 */
async function forward(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const search = new URL(request.url).search;
  const upstreamUrl = `${UPSTREAM_URL}/${path.join("/")}${search}`;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  if (token) headers.set("authorization", `Bearer ${token}`);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.text() : undefined;

  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body: body || undefined,
    cache: "no-store",
  });

  // 204/205/304 are null-body statuses - constructing a Response with even an
  // empty-string body for one of these throws.
  if (upstream.status === 204 || upstream.status === 205 || upstream.status === 304) {
    return new NextResponse(null, { status: upstream.status });
  }

  // Streamed through rather than `.text()`d - stringifying would mangle a
  // binary body like the completion-document PDF. This covers text and
  // binary alike, so JSON responses ride through unchanged too.
  const responseHeaders = new Headers({
    "content-type": upstream.headers.get("content-type") ?? "application/json",
  });
  const disposition = upstream.headers.get("content-disposition");
  if (disposition) responseHeaders.set("content-disposition", disposition);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
