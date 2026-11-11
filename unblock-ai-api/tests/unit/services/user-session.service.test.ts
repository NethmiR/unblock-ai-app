import test from "node:test";
import assert from "node:assert/strict";
import { UserSessionService } from "../../../src/services/user-session.service.js";
import { InMemoryUserSessionRepository } from "../../../src/repositories/user-session-repository/in-memory.user-session-repository.js";
import { AuthErrorCode } from "../../../src/data/constants/auth.constant.js";
import { UserSessionRevocationReason } from "../../../src/data/constants/user-session.constant.js";
import { MILLISECONDS_PER_HOUR } from "../../../src/data/constants/time.constant.js";
import { NotFoundError } from "../../../src/errors/not-found.error.js";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";

function build(): { service: UserSessionService; repository: InMemoryUserSessionRepository } {
  const repository = new InMemoryUserSessionRepository();
  const service = new UserSessionService({
    userSessionRepository: repository,
    authConfig: { sessionTtlHours: 12, maxFailedAttempts: 0, lockoutDurationMinutes: 15 },
  });
  return { service, repository };
}

test("issue creates a session that expires after the configured TTL and resolves by token", async () => {
  const { service } = build();
  const before = Date.now();
  const { token, session } = await service.issue(USER_ID, { userAgent: "UA" });

  const ttl = session.expiresAt.getTime() - before;
  assert.ok(ttl >= 12 * MILLISECONDS_PER_HOUR - 1000 && ttl <= 12 * MILLISECONDS_PER_HOUR + 1000);
  assert.equal((await service.resolve(token))?.id, session.id);
  assert.equal(await service.resolve("unknown"), null);
});

test("listActive flags the current session", async () => {
  const { service } = build();
  const first = await service.issue(USER_ID, { userAgent: "First" });
  await service.issue(USER_ID, { userAgent: "Second" });
  await service.issue(OTHER_USER_ID, { userAgent: "Other" });

  const sessions = await service.listActive(USER_ID, first.session.id);
  assert.equal(sessions.length, 2);
  assert.deepEqual(
    sessions.filter((session) => session.is_current).map((session) => session.user_agent),
    ["First"],
  );
});

test("revoke ends the caller's own session", async () => {
  const { service } = build();
  const { token, session } = await service.issue(USER_ID, { userAgent: null });

  await service.revoke(USER_ID, session.id, UserSessionRevocationReason.REVOKED_BY_USER);
  assert.equal(await service.resolve(token), null);
});

test("revoke of another user's session throws USER_SESSION_NOT_FOUND", async () => {
  const { service } = build();
  const { token, session } = await service.issue(USER_ID, { userAgent: null });

  await assert.rejects(
    service.revoke(OTHER_USER_ID, session.id, UserSessionRevocationReason.REVOKED_BY_USER),
    (err: unknown) => err instanceof NotFoundError && err.code === AuthErrorCode.USER_SESSION_NOT_FOUND,
  );
  assert.ok(await service.resolve(token));
});

test("revokeOthers keeps only the current session", async () => {
  const { service } = build();
  const current = await service.issue(USER_ID, { userAgent: null });
  const other = await service.issue(USER_ID, { userAgent: null });

  assert.equal(await service.revokeOthers(USER_ID, current.session.id), 1);
  assert.ok(await service.resolve(current.token));
  assert.equal(await service.resolve(other.token), null);
});
