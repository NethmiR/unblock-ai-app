import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  generateUserSessionToken,
  hashUserSessionToken,
} from "../../../src/utils/auth/user-session-token.util.js";

test("generateUserSessionToken produces 256-bit base64url tokens", () => {
  const token = generateUserSessionToken();
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(Buffer.from(token, "base64url").length, 32);
});

test("generateUserSessionToken never repeats", () => {
  const tokens = new Set(Array.from({ length: 100 }, () => generateUserSessionToken()));
  assert.equal(tokens.size, 100);
});

test("hashUserSessionToken is a deterministic sha256 hex digest of the exact token", () => {
  const token = " token-with-spaces ";
  const expected = createHash("sha256").update(token, "utf8").digest("hex");
  assert.equal(hashUserSessionToken(token), expected);
  assert.notEqual(hashUserSessionToken(token), hashUserSessionToken(token.trim()));
});
