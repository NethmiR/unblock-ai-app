import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthUser, SessionPayload } from "../../lib/types/auth/auth.type.js";

export interface IssuedSessionToken {
  token: string;
  expiresAt: Date;
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
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

/** Session = HMAC-signed stateless cookie (D-3); exp is carried in the payload
 *  since there is no server-side session row to expire it. */
export function issueSessionToken(user: AuthUser, secret: string, ttlHours: number): IssuedSessionToken {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  const payload: SessionPayload = { sub: user.id, aud: user.audience, usr: user.username, exp: expiresAt.getTime() };
  const encoded = base64url(JSON.stringify(payload));
  return { token: `${encoded}.${sign(encoded, secret)}`, expiresAt };
}

/** Non-throwing, like the approval token verifier: any failure is `null`. */
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
