import test from "node:test";
import assert from "node:assert/strict";
import { issueToken, parseToken, verifyToken } from "../../../src/utils/approval/token.util.js";

const SECRET = "test-secret";

test("round-trip: issued token verifies and carries the original ids", () => {
  const token = issueToken("task-1", "step-1", SECRET);
  const result = verifyToken(token, SECRET);

  assert.ok(result);
  assert.equal(result.task_id, "task-1");
  assert.equal(result.step_id, "step-1");
  assert.ok(result.nonce.length > 0);
});

test("tampered payload fails verification", () => {
  const token = issueToken("task-1", "step-1", SECRET);
  const [, signature] = token.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ t: "task-2", s: "step-1", n: "x" })).toString("base64url");

  assert.equal(verifyToken(`${forgedPayload}.${signature}`, SECRET), null);
});

test("tampered signature fails verification", () => {
  const token = issueToken("task-1", "step-1", SECRET);
  const [payload] = token.split(".");

  assert.equal(verifyToken(`${payload}.not-the-real-signature`, SECRET), null);
});

test("token signed with a different secret fails verification", () => {
  const token = issueToken("task-1", "step-1", SECRET);

  assert.equal(verifyToken(token, "a-different-secret"), null);
});

test("garbage, empty, no-dot, or line-wrapped input never throws and returns null", () => {
  const token = issueToken("task-1", "step-1", SECRET);
  const wrapped = token.replace(".", "\n.");

  assert.doesNotThrow(() => {
    assert.equal(verifyToken("garbage", SECRET), null);
    assert.equal(verifyToken("", SECRET), null);
    assert.equal(verifyToken("no-dot-here", SECRET), null);
    assert.equal(verifyToken(wrapped, SECRET), null);
    assert.equal(parseToken("garbage"), null);
    assert.equal(parseToken(""), null);
    assert.equal(parseToken("no-dot-here"), null);
  });
});

test("parseToken recovers the payload without checking the signature", () => {
  const token = issueToken("task-1", "step-1", SECRET);
  const parsed = parseToken(token);

  assert.ok(parsed);
  assert.equal(parsed.task_id, "task-1");
  assert.equal(parsed.step_id, "step-1");
});
