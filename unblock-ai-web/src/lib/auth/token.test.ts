import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySessionToken } from "@/lib/auth/token";
import type { AuthAudience } from "@/types/auth";

/**
 * Mirrors unblock-ai-api/src/utils/auth/session-token.util.ts#issueSessionToken -
 * there is no issuer on the web side (only the API issues tokens), so tests
 * build one the same way the API does.
 */
function issueTestToken(
  payload: { sub: string; aud: AuthAudience; usr: string; exp: number },
  secret: string,
): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded, "utf8").digest("base64url");
  return `${encoded}.${signature}`;
}

const SECRET = "test-secret";
const VALID_PAYLOAD = { sub: "user-1", aud: "admin" as AuthAudience, usr: "admin", exp: Date.now() + 3_600_000 };

describe("verifySessionToken", () => {
  it("accepts a well-formed, correctly signed, unexpired token", () => {
    const token = issueTestToken(VALID_PAYLOAD, SECRET);
    const result = verifySessionToken(token, SECRET);

    expect(result).not.toBeNull();
    expect(result?.sub).toBe(VALID_PAYLOAD.sub);
    expect(result?.aud).toBe(VALID_PAYLOAD.aud);
    expect(result?.usr).toBe(VALID_PAYLOAD.usr);
  });

  it("rejects a token with a tampered payload", () => {
    const token = issueTestToken(VALID_PAYLOAD, SECRET);
    const [, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...VALID_PAYLOAD, aud: "portal" }),
      "utf8",
    ).toString("base64url");

    expect(verifySessionToken(`${forgedPayload}.${signature}`, SECRET)).toBeNull();
  });

  it("rejects a token with a tampered signature", () => {
    const token = issueTestToken(VALID_PAYLOAD, SECRET);
    const [encoded] = token.split(".");

    expect(verifySessionToken(`${encoded}.not-the-real-signature`, SECRET)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = issueTestToken(VALID_PAYLOAD, SECRET);

    expect(verifySessionToken(token, "a-different-secret")).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = issueTestToken({ ...VALID_PAYLOAD, exp: Date.now() - 1000 }, SECRET);

    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it("never throws on garbage, empty, or malformed input", () => {
    expect(() => {
      expect(verifySessionToken("garbage", SECRET)).toBeNull();
      expect(verifySessionToken("", SECRET)).toBeNull();
      expect(verifySessionToken("no-dot-here", SECRET)).toBeNull();
    }).not.toThrow();
  });
});
