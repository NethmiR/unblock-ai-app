import test from "node:test";
import assert from "node:assert/strict";
import { AuthenticationService } from "../../../src/services/authentication.service.js";
import { UserSessionService } from "../../../src/services/user-session.service.js";
import { InMemoryUserRepository } from "../../../src/repositories/user-repository/in-memory.user-repository.js";
import { InMemoryUserSessionRepository } from "../../../src/repositories/user-session-repository/in-memory.user-session-repository.js";
import { hashPassword } from "../../../src/utils/shared/password.util.js";
import { hashUserSessionToken } from "../../../src/utils/auth/user-session-token.util.js";
import { AuthErrorCode } from "../../../src/data/constants/auth.constant.js";
import { Permission } from "../../../src/data/constants/permission.constant.js";
import { UserStatus } from "../../../src/data/constants/user.constant.js";
import { UserSessionRevocationReason } from "../../../src/data/constants/user-session.constant.js";
import { MILLISECONDS_PER_MINUTE } from "../../../src/data/constants/time.constant.js";
import { BaseError } from "../../../src/errors/base.error.js";
import type { AuthConfig } from "../../../src/lib/types/config/config.type.js";
import type { UserCredentialRecord } from "../../../src/lib/types/user/user.type.js";
import type { UserSessionRecord } from "../../../src/lib/types/user-session/user-session.type.js";

const PASSWORD = "Correct-Horse-Battery-Staple9";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const CLIENT = { userAgent: "Unit Test" };

async function user(overrides: Partial<UserCredentialRecord> = {}): Promise<UserCredentialRecord> {
  const now = new Date();
  return {
    id: USER_ID,
    email: "jane@example.com",
    fullName: "Jane Doe",
    passwordHash: await hashPassword(PASSWORD),
    status: UserStatus.ACTIVE,
    permissions: [Permission.TASK_CREATE],
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    lastLoginAt: null,
    createdByUserId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

interface Harness {
  service: AuthenticationService;
  userRepository: InMemoryUserRepository;
  userSessionRepository: InMemoryUserSessionRepository;
}

function harness(
  users: UserCredentialRecord[],
  authConfig: Partial<AuthConfig> = {},
  sessions: UserSessionRecord[] = [],
): Harness {
  const config: AuthConfig = { sessionTtlHours: 12, maxFailedAttempts: 0, lockoutDurationMinutes: 15, ...authConfig };
  const userRepository = new InMemoryUserRepository({ users });
  const userSessionRepository = new InMemoryUserSessionRepository({ sessions });
  const userSessionService = new UserSessionService({ userSessionRepository, authConfig: config });
  const service = new AuthenticationService({ userRepository, userSessionService, authConfig: config });
  return { service, userRepository, userSessionRepository };
}

function hasCode(code: AuthErrorCode) {
  return (err: unknown) => err instanceof BaseError && err.code === code;
}

test("login rejects an unknown email with INVALID_CREDENTIALS", async () => {
  const { service } = harness([]);
  await assert.rejects(
    service.login({ email: "nobody@example.com", password: PASSWORD }, CLIENT),
    hasCode(AuthErrorCode.INVALID_CREDENTIALS),
  );
});

test("login rejects a wrong password and records the failure", async () => {
  const { service, userRepository } = harness([await user()]);
  await assert.rejects(
    service.login({ email: "jane@example.com", password: "wrong" }, CLIENT),
    hasCode(AuthErrorCode.INVALID_CREDENTIALS),
  );
  assert.equal((await userRepository.findById(USER_ID))?.failedLoginCount, 1);
});

test("login locks the account when the failure count reaches the maximum", async () => {
  const { service } = harness([await user()], { maxFailedAttempts: 2 });
  await assert.rejects(service.login({ email: "jane@example.com", password: "x" }, CLIENT), hasCode(AuthErrorCode.INVALID_CREDENTIALS));
  await assert.rejects(service.login({ email: "jane@example.com", password: "x" }, CLIENT), hasCode(AuthErrorCode.ACCOUNT_LOCKED));
});

test("login rejects a locked account even with the correct password", async () => {
  const locked = await user({ failedLoginCount: 3, lastFailedLoginAt: new Date() });
  const { service } = harness([locked], { maxFailedAttempts: 3 });
  await assert.rejects(
    service.login({ email: "jane@example.com", password: PASSWORD }, CLIENT),
    hasCode(AuthErrorCode.ACCOUNT_LOCKED),
  );
});

test("login succeeds once the lockout window has passed", async () => {
  const lastFailure = new Date(Date.now() - 20 * MILLISECONDS_PER_MINUTE);
  const { service, userRepository } = harness(
    [await user({ failedLoginCount: 3, lastFailedLoginAt: lastFailure })],
    { maxFailedAttempts: 3, lockoutDurationMinutes: 15 },
  );
  const result = await service.login({ email: "jane@example.com", password: PASSWORD }, CLIENT);
  assert.equal(result.user.id, USER_ID);
  assert.equal((await userRepository.findById(USER_ID))?.failedLoginCount, 0);
});

test("login ignores lockout entirely when it is disabled", async () => {
  const { service } = harness([await user({ failedLoginCount: 99, lastFailedLoginAt: new Date() })]);
  const result = await service.login({ email: "jane@example.com", password: PASSWORD }, CLIENT);
  assert.equal(result.user.id, USER_ID);
});

test("login rejects a disabled account with ACCOUNT_DISABLED", async () => {
  const { service } = harness([await user({ status: UserStatus.DISABLED })]);
  await assert.rejects(
    service.login({ email: "jane@example.com", password: PASSWORD }, CLIENT),
    hasCode(AuthErrorCode.ACCOUNT_DISABLED),
  );
});

test("login succeeds: resets counters, purges expired sessions and issues a new one", async () => {
  const expired: UserSessionRecord = {
    id: "00000000-0000-4000-9000-000000000001",
    userId: USER_ID,
    tokenHash: "expired-hash",
    userAgent: null,
    createdAt: new Date(Date.now() - 2 * MILLISECONDS_PER_MINUTE),
    lastSeenAt: new Date(Date.now() - 2 * MILLISECONDS_PER_MINUTE),
    expiresAt: new Date(Date.now() - MILLISECONDS_PER_MINUTE),
    revokedAt: null,
    revocationReason: null,
  };
  const { service, userRepository, userSessionRepository } = harness(
    [await user({ failedLoginCount: 1, lastFailedLoginAt: new Date() })],
    {},
    [expired],
  );

  const result = await service.login({ email: " JANE@example.com ", password: PASSWORD }, CLIENT);

  assert.deepEqual(result.user, {
    id: USER_ID,
    email: "jane@example.com",
    fullName: "Jane Doe",
    permissions: [Permission.TASK_CREATE],
  });
  const stored = await userRepository.findById(USER_ID);
  assert.equal(stored?.failedLoginCount, 0);
  assert.ok(stored?.lastLoginAt);
  assert.equal(await userSessionRepository.deleteExpiredByUserId(USER_ID, new Date()), 0);
  const session = await userSessionRepository.findActiveByTokenHash(hashUserSessionToken(result.token), new Date());
  assert.equal(session?.userAgent, "Unit Test");
  assert.deepEqual(session?.expiresAt, result.expiresAt);
});

test("authenticate resolves a valid token to the user and session", async () => {
  const { service } = harness([await user()]);
  const { token } = await service.login({ email: "jane@example.com", password: PASSWORD }, CLIENT);

  const context = await service.authenticate(token);
  assert.equal(context?.user.id, USER_ID);
  assert.ok(context?.session.id);
});

test("authenticate returns null for an unknown, revoked or expired token", async () => {
  const { service, userSessionRepository } = harness([await user()]);
  assert.equal(await service.authenticate("unknown"), null);

  const { token } = await service.login({ email: "jane@example.com", password: PASSWORD }, CLIENT);
  const context = await service.authenticate(token);
  await userSessionRepository.revoke(context!.session.id, USER_ID, UserSessionRevocationReason.SIGNED_OUT, new Date());
  assert.equal(await service.authenticate(token), null);

  const expired = harness([await user()], {}, [
    {
      id: "00000000-0000-4000-9000-000000000002",
      userId: USER_ID,
      tokenHash: hashUserSessionToken("expired-token"),
      userAgent: null,
      createdAt: new Date(Date.now() - 2000),
      lastSeenAt: new Date(Date.now() - 2000),
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
      revocationReason: null,
    },
  ]);
  assert.equal(await expired.service.authenticate("expired-token"), null);
});

test("authenticate returns null when the session's user is disabled", async () => {
  const session: UserSessionRecord = {
    id: "00000000-0000-4000-9000-000000000003",
    userId: USER_ID,
    tokenHash: hashUserSessionToken("disabled-user-token"),
    userAgent: null,
    createdAt: new Date(),
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    revocationReason: null,
  };
  const { service } = harness([await user({ status: UserStatus.DISABLED })], {}, [session]);
  assert.equal(await service.authenticate("disabled-user-token"), null);
});

test("authenticate touches last_seen_at only after the activity interval", async () => {
  const staleSeen = new Date(Date.now() - 10 * MILLISECONDS_PER_MINUTE);
  const freshSeen = new Date(Date.now() - MILLISECONDS_PER_MINUTE);
  const base = {
    userId: USER_ID,
    userAgent: null,
    createdAt: staleSeen,
    expiresAt: new Date(Date.now() + 60 * MILLISECONDS_PER_MINUTE),
    revokedAt: null,
    revocationReason: null,
  };
  const { service, userSessionRepository } = harness([await user()], {}, [
    { ...base, id: "00000000-0000-4000-9000-000000000004", tokenHash: hashUserSessionToken("stale"), lastSeenAt: staleSeen },
    { ...base, id: "00000000-0000-4000-9000-000000000005", tokenHash: hashUserSessionToken("fresh"), lastSeenAt: freshSeen },
  ]);

  await service.authenticate("stale");
  await service.authenticate("fresh");

  const now = new Date();
  const stale = await userSessionRepository.findActiveByTokenHash(hashUserSessionToken("stale"), now);
  const fresh = await userSessionRepository.findActiveByTokenHash(hashUserSessionToken("fresh"), now);
  assert.ok(stale!.lastSeenAt.getTime() > staleSeen.getTime());
  assert.deepEqual(fresh?.lastSeenAt, freshSeen);
});

test("logout revokes the current session with SIGNED_OUT", async () => {
  const { service } = harness([await user()]);
  const { token } = await service.login({ email: "jane@example.com", password: PASSWORD }, CLIENT);
  const context = await service.authenticate(token);

  await service.logout(context!);
  assert.equal(await service.authenticate(token), null);
});
