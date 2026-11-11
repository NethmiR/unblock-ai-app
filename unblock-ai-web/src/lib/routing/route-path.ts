export enum RoutePath {
  HOME = "/",
  LOGIN = "/login",
  ACCOUNT = "/account",
}

export const NEXT_QUERY_PARAMETER = "next";

export function safeRedirectPath(candidate: string | null, fallback: RoutePath): string {
  return candidate && candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : fallback;
}

export function loginPathFor(next: string): string {
  return `${RoutePath.LOGIN}?${new URLSearchParams({ [NEXT_QUERY_PARAMETER]: next })}`;
}
