/**
 * Server-only: called from the Route Handlers that create/destroy a session
 * (`app/api/auth/login`, `app/api/auth/logout`) and from `lib/auth/session.ts`.
 *
 * Talks to the API's own origin directly rather than going through
 * `apiRequest`'s `/api/proxy` indirection (see client.ts) - this module is
 * what BOOTSTRAPS a session, so it cannot depend on one already sitting in a
 * cookie the way the proxy does.
 */
import { ApiError } from "./client";
import type { AuthUser, LoginCredentials, LoginResult } from "@/types/auth";

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const { method = "GET", body, token } = options;
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

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

export const authApi = {
  login: (credentials: LoginCredentials) =>
    request<LoginResult>("/auth/login", { method: "POST", body: credentials }),

  me: (token: string) => request<{ user: AuthUser }>("/auth/me", { token }),

  logout: (token: string) => request<void>("/auth/logout", { method: "POST", token }),
};
