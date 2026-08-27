/**
 * Verify-only mirror of unblock-ai-api/src/utils/auth/session-token.util.ts.
 *
 * Used by `proxy.ts` to check a session cookie's signature and expiry
 * without a network round trip on every navigation. Needs the SAME
 * `SESSION_TOKEN_SECRET` as the API (see .env.local) - this is a shared
 * secret, not a public one, so it is deliberately NOT prefixed NEXT_PUBLIC_.
 *
 * Proxy runs on the Node.js runtime by default in Next 16 (the `middleware.js`
 * convention was renamed to `proxy.js` and no longer defaults to Edge - see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md),
 * so node:crypto is available here exactly as it is on the API. No Edge/Web
 * Crypto workaround is needed, unlike what older Next.js versions required.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthAudience } from "@/types/auth";

export { SESSION_COOKIE_NAME } from "./session-cookie";

export interface SessionPayload {
  sub: string;
  aud: AuthAudience;
  usr: string;
  exp: number;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.sub === "string" &&
    (record.aud === "admin" || record.aud === "portal") &&
    typeof record.usr === "string" &&
    typeof record.exp === "number"
  );
}

/** Non-throwing: any failure - bad shape, bad signature, expired - is `null`. */
export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  if (typeof token !== "string") return null;

  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;

  const encoded = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  const expected = Buffer.from(sign(encoded, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!isSessionPayload(decoded)) return null;
  if (decoded.exp <= Date.now()) return null;

  return decoded;
}
