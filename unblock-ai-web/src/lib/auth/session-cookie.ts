/**
 * Shared by `proxy.ts`, the auth Route Handlers, `lib/auth/session.ts`, and
 * `lib/api/client.ts`'s server-side branch. Kept in its own zero-dependency
 * file so importing the cookie name (from client.ts, which is reachable from
 * Client Components) never risks pulling `token.ts`'s `node:crypto` import
 * into a browser bundle.
 */
export const SESSION_COOKIE_NAME = "ua_session";
