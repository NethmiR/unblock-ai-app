import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryUserSessionRepository } from "../../../src/repositories/user-session-repository/in-memory.user-session-repository.js";
import { UserSessionRevocationReason } from "../../../src/data/constants/user-session.constant.js";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
const HOUR_MS = 60 * 60 * 1000;

function future(): Date {
  return new Date(Date.now() + HOUR_MS);
}

test("findActiveByTokenHash finds an active session and ignores expired or revoked ones", async () => {
  const repository = new InMemoryUserSessionRepository();
  const active = await repository.create({ userId: USER_ID, tokenHash: "active", userAgent: null, expiresAt: future() });
  await repository.create({ userId: USER_ID, tokenHash: "expired", userAgent: null, expiresAt: new Date(Date.now() - 1) });
  const revoked = await repository.create({ userId: USER_ID, tokenHash: "revoked", userAgent: null, expiresAt: future() });
  await repository.revoke(revoked.id, USER_ID, UserSessionRevocationReason.SIGNED_OUT, new Date());

  const now = new Date();
  assert.equal((await repository.findActiveByTokenHash("active", now))?.id, active.id);
  assert.equal(await repository.findActiveByTokenHash("expired", now), null);
  assert.equal(await repository.findActiveByTokenHash("revoked", now), null);
  assert.deepEqual(
    (await repository.listActiveByUserId(USER_ID, now)).map((session) => session.id),
    [active.id],
  );
});

test("revoke refuses another user's session and an already revoked one", async () => {
  const repository = new InMemoryUserSessionRepository();
  const session = await repository.create({ userId: USER_ID, tokenHash: "t", userAgent: "UA", expiresAt: future() });

  assert.equal(await repository.revoke(session.id, OTHER_USER_ID, UserSessionRevocationReason.REVOKED_BY_USER, new Date()), false);
  assert.equal(await repository.revoke(session.id, USER_ID, UserSessionRevocationReason.REVOKED_BY_USER, new Date()), true);
  assert.equal(await repository.revoke(session.id, USER_ID, UserSessionRevocationReason.REVOKED_BY_USER, new Date()), false);
});

test("revokeAllExcept keeps the named session and leaves other users untouched", async () => {
  const repository = new InMemoryUserSessionRepository();
  const keep = await repository.create({ userId: USER_ID, tokenHash: "keep", userAgent: null, expiresAt: future() });
  await repository.create({ userId: USER_ID, tokenHash: "a", userAgent: null, expiresAt: future() });
  await repository.create({ userId: USER_ID, tokenHash: "b", userAgent: null, expiresAt: future() });
  const other = await repository.create({ userId: OTHER_USER_ID, tokenHash: "c", userAgent: null, expiresAt: future() });

  const revoked = await repository.revokeAllExcept(USER_ID, keep.id, UserSessionRevocationReason.REVOKED_BY_USER, new Date());

  assert.equal(revoked, 2);
  const now = new Date();
  assert.deepEqual((await repository.listActiveByUserId(USER_ID, now)).map((s) => s.id), [keep.id]);
  assert.deepEqual((await repository.listActiveByUserId(OTHER_USER_ID, now)).map((s) => s.id), [other.id]);
});

test("touch updates last_seen_at", async () => {
  const repository = new InMemoryUserSessionRepository();
  const session = await repository.create({ userId: USER_ID, tokenHash: "t", userAgent: null, expiresAt: future() });
  const at = new Date(Date.now() + 1000);
  await repository.touch(session.id, at);

  assert.deepEqual((await repository.findActiveByTokenHash("t", new Date()))?.lastSeenAt, at);
});

test("deleteExpiredByUserId removes only that user's expired sessions", async () => {
  const repository = new InMemoryUserSessionRepository();
  await repository.create({ userId: USER_ID, tokenHash: "old", userAgent: null, expiresAt: new Date(Date.now() - 1) });
  await repository.create({ userId: USER_ID, tokenHash: "live", userAgent: null, expiresAt: future() });
  await repository.create({ userId: OTHER_USER_ID, tokenHash: "other-old", userAgent: null, expiresAt: new Date(Date.now() - 1) });

  assert.equal(await repository.deleteExpiredByUserId(USER_ID, new Date()), 1);
  assert.equal(await repository.deleteExpiredByUserId(USER_ID, new Date()), 0);
  assert.equal(await repository.deleteExpiredByUserId(OTHER_USER_ID, new Date()), 1);
});

test("revoke refuses an expired session", async () => {
  const repository = new InMemoryUserSessionRepository();
  const expired = await repository.create({
    userId: USER_ID,
    tokenHash: "expired",
    userAgent: null,
    expiresAt: new Date(Date.now() - 1),
  });

  assert.equal(
    await repository.revoke(expired.id, USER_ID, UserSessionRevocationReason.REVOKED_BY_USER, new Date()),
    false,
  );
});
