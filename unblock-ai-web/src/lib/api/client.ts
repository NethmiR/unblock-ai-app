import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

/**
 * The ONE place this application talks to the backend.
 *
 * Every feature module (workflows, drafts, selection) builds on this. Nothing
 * else in the codebase calls `fetch` directly - that is what makes it possible
 * to add auth headers, retries, or a base-URL change in exactly one edit.
 *
 * Two branches, because a Server Component and a browser fetch can each reach
 * the auth token in only ONE of two ways:
 *
 * - Server-side (Server Component / Route Handler): read the httpOnly
 *   session cookie directly via `next/headers` and attach it as an
 *   Authorization header on a call straight to the API. `next/headers` is
 *   dynamically imported so this module stays safe to import from Client
 *   Components too - the import is only ever reached on the server branch.
 * - Browser: a fetch can never read an httpOnly cookie to set its own
 *   header, so it goes through this app's OWN `/api/proxy/*` Route Handler
 *   instead (same origin, so the cookie rides along automatically) - see
 *   `app/api/proxy/[...path]/route.ts`, which reads the cookie server-side
 *   and forwards the Authorization header upstream.
 *
 * That is what keeps every existing client-component call site
 * (TemplateEditor, DeleteTemplateDialog, useSelectionSession, ...) working
 * unchanged now that the API guards most routes with `requireAuth()`/
 * `requireRole()`.
 */
const DIRECT_API_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";
const PROXY_URL = "/api/proxy";

/** A failed request, carrying the status and the server's error payload. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;

  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";

  let url: string;
  if (typeof window === "undefined") {
    const { cookies } = await import("next/headers");
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if (token) headers["Authorization"] = `Bearer ${token}`;
    url = `${DIRECT_API_URL}${path}`;
  } else {
    url = `${PROXY_URL}${path}`;
  }

  const response = await fetch(url, {
    method,
    signal,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",   // this data is never safe to serve stale
  });

  // 204 has no body; parsing it would throw.
  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      payload?.error ?? `Request failed with status ${response.status}`,
      response.status,
      payload?.code,
      payload?.details,
    );
  }

  return payload as T;
}

/** SWR's fetcher signature. Lets any component do `useSWR("/workflows", fetcher)`. */
export const fetcher = <T,>(path: string) => apiRequest<T>(path);
