import test from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import { readBearerToken } from "../../../src/utils/http/bearer-token.util.js";

function requestWith(authorization: string | undefined): Request {
  return { header: (name: string) => (name.toLowerCase() === "authorization" ? authorization : undefined) } as Request;
}

test("readBearerToken returns the token from a bearer header", () => {
  assert.equal(readBearerToken(requestWith("Bearer abc.def")), "abc.def");
  assert.equal(readBearerToken(requestWith("bearer   abc ")), "abc");
});

test("readBearerToken returns null for missing, empty or non-bearer headers", () => {
  assert.equal(readBearerToken(requestWith(undefined)), null);
  assert.equal(readBearerToken(requestWith("Bearer ")), null);
  assert.equal(readBearerToken(requestWith("Basic abc")), null);
  assert.equal(readBearerToken(requestWith("Bearerabc")), null);
});
