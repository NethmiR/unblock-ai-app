import { ApiError } from "./client";
import type { CurrentUserResponse, LoginRequest, LoginResponse } from "@/types/auth";

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";

interface AuthRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  token?: string;
  userAgent?: string | null;
}

async function request<T>(path: string, { method = "GET", body, token, userAgent }: AuthRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (userAgent) headers["User-Agent"] = userAgent;

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
  login: (credentials: LoginRequest, userAgent: string | null) =>
    request<LoginResponse>("/auth/login", { method: "POST", body: credentials, userAgent }),

  me: (token: string) => request<CurrentUserResponse>("/auth/me", { token }),

  logout: (token: string) => request<void>("/auth/logout", { method: "POST", token }),
};
