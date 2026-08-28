import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, burnHashTime } from "../../../src/utils/shared/password.util.js";

test("round-trip: a hashed password verifies against the original plaintext", async () => {
  const hash = await hashPassword("Correct-Horse-Battery-Staple9");
  assert.equal(await verifyPassword("Correct-Horse-Battery-Staple9", hash), true);
});

test("verifyPassword rejects the wrong password", async () => {
  const hash = await hashPassword("Correct-Horse-Battery-Staple9");
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("two hashes of the same password differ (salting)", async () => {
  const first = await hashPassword("same-password");
  const second = await hashPassword("same-password");
  assert.notEqual(first, second);
  // Both still verify against the original plaintext despite differing salts.
  assert.equal(await verifyPassword("same-password", first), true);
  assert.equal(await verifyPassword("same-password", second), true);
});

test("verifyPassword never throws on a malformed stored hash and returns false", async () => {
  await assert.doesNotReject(async () => {
    assert.equal(await verifyPassword("anything", "not-a-real-hash"), false);
    assert.equal(await verifyPassword("anything", ""), false);
    assert.equal(await verifyPassword("anything", "scrypt$only$four$parts"), false);
    assert.equal(await verifyPassword("anything", "bcrypt$16384$8$1$c2FsdA==$aGFzaA=="), false);
  });
});

test("burnHashTime never throws", async () => {
  await assert.doesNotReject(() => burnHashTime());
});
