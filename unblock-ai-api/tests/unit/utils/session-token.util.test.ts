import test from "node:test";
import assert from "node:assert/strict";
import { issueSessionToken, verifySessionToken } from "../../../src/utils/auth/session-token.util.js";
import type { AuthUser } from "../../../src/lib/types/auth/auth.type.js";

const SECRET = "test-secret";

const USER: AuthUser = {
  id: "00000000-0000-0000-0000-000000000001",
  audience: "admin",
  username: "admin",
  email: "admin@example.com",
  full_name: "Test Admin",
  department: null,
  organisation: null,
  faculty: null,
};

test("round-trip: an issued token verifies and carries the original identity", () => {
  const { token, expiresAt } = issueSessionToken(USER, SECRET, 12);
  const payload = verifySessionToken(token, SECRET);

  assert.ok(payload);
  assert.equal(payload.sub, USER.id);
  assert.equal(payload.aud, USER.audience);
  assert.equal(payload.usr, USER.username);
  assert.equal(payload.exp, expiresAt.getTime());
});

test("tampered payload fails verification", () => {
  const { token } = issueSessionToken(USER, SECRET, 12);
  const [, signature] = token.split(".");
  const forgedPayload = Buffer.from(
    JSON.stringify({ sub: "someone-else", aud: "admin", usr: "admin", exp: Date.now() + 100000 }),
  ).toString("base64url");

  assert.equal(verifySessionToken(`${forgedPayload}.${signature}`, SECRET), null);
});

test("tampered signature fails verification", () => {
  const { token } = issueSessionToken(USER, SECRET, 12);
  const [payload] = token.split(".");

  assert.equal(verifySessionToken(`${payload}.not-the-real-signature`, SECRET), null);
});

test("token signed with a different secret fails verification", () => {
  const { token } = issueSessionToken(USER, SECRET, 12);

  assert.equal(verifySessionToken(token, "a-different-secret"), null);
});

test("an expired token fails verification", () => {
  const { token } = issueSessionToken(USER, SECRET, -1);

  assert.equal(verifySessionToken(token, SECRET), null);
});

test("garbage, empty, or no-dot input never throws and returns null", () => {
  assert.doesNotThrow(() => {
    assert.equal(verifySessionToken("garbage", SECRET), null);
    assert.equal(verifySessionToken("", SECRET), null);
    assert.equal(verifySessionToken("no-dot-here", SECRET), null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.equal(verifySessionToken(null as any, SECRET), null);
  });
});
