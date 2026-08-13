import test from "node:test";
import assert from "node:assert/strict";
import { sha256 } from "../../../src/utils/shared/hash.util.js";

test("identical text produces identical hashes", () => {
  assert.equal(sha256("hello world"), sha256("hello world"));
});

test("CRLF and LF line endings hash the same after normalisation", () => {
  assert.equal(sha256("line one\r\nline two"), sha256("line one\nline two"));
});

test("leading and trailing whitespace is trimmed before hashing", () => {
  assert.equal(sha256("  hello  "), sha256("hello"));
});

test("different text produces different hashes", () => {
  assert.notEqual(sha256("hello"), sha256("goodbye"));
});

test("produces a 64-character lowercase hex digest", () => {
  assert.match(sha256("anything"), /^[0-9a-f]{64}$/);
});
