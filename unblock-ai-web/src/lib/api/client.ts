/**
 * The ONE place this application talks to the backend.
 *
 * Every feature module (workflows, drafts, selection) builds on this. Nothing
 * else in the codebase calls `fetch` directly - that is what makes it possible
 * to add auth headers, retries, or a base-URL change in exactly one edit.
 */
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";

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

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
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
