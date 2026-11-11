import test from "node:test";
import assert from "node:assert/strict";
import {
  TEST_DEFAULT_PASSWORD,
  bearer,
  postLogin,
  startAuthTestServer,
} from "../helpers/auth-test-server.helper.js";
import { TEST_USERS, TestIdentity, authHeaderFor } from "../helpers/test-server.helper.js";
import { AuthErrorCode } from "../../src/data/constants/auth.constant.js";
import { UserErrorCode } from "../../src/data/constants/user-error.constant.js";
import { Permission } from "../../src/data/constants/permission.constant.js";
import { UserStatus } from "../../src/data/constants/user.constant.js";
import type { CurrentUserResponseDto, LoginResponseDto } from "../../src/lib/types/auth/auth.type.js";
import type { UserDto } from "../../src/lib/types/user/user.type.js";
import type { ErrorResponseBody } from "../../src/lib/types/http/http.type.js";

function createUser(baseUrl: string, body: Record<string, unknown>, identity = TestIdentity.USER_MANAGER) {
  return fetch(`${baseUrl}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaderFor(identity) },
    body: JSON.stringify(body),
  });
}

test("user routes require authentication", async () => {
  const server = await startAuthTestServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/users`);
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as ErrorResponseBody).code, AuthErrorCode.AUTHENTICATION_REQUIRED);
  } finally {
    await server.close();
  }
});

test("user routes reject a caller without user:manage with 403 PERMISSION_DENIED", async () => {
  const server = await startAuthTestServer();
  try {
    for (const res of [
      await fetch(`${server.baseUrl}/api/users`, { headers: authHeaderFor(TestIdentity.TASK_CREATOR) }),
      await createUser(server.baseUrl, { email: "x@example.com", full_name: "X", permissions: [Permission.TASK_CREATE] }, TestIdentity.WORKFLOW_MANAGER),
    ]) {
      assert.equal(res.status, 403);
      assert.equal(((await res.json()) as ErrorResponseBody).code, AuthErrorCode.PERMISSION_DENIED);
    }
  } finally {
    await server.close();
  }
});

test("a user manager creates, lists and fetches a user who can then log in", async () => {
  const server = await startAuthTestServer();
  try {
    const created = await createUser(server.baseUrl, {
      email: "Creator@Example.com",
      full_name: "Task Creator",
      permissions: [Permission.TASK_CREATE, Permission.TASK_APPROVE],
    });
    assert.equal(created.status, 201);
    const { user } = (await created.json()) as { user: UserDto };
    assert.equal(user.email, "creator@example.com");
    assert.equal(user.status, UserStatus.ACTIVE);
    assert.deepEqual(user.permissions, [Permission.TASK_APPROVE, Permission.TASK_CREATE]);
    assert.equal(user.created_by_user_id, TEST_USERS[TestIdentity.USER_MANAGER].id);
    assert.equal(user.last_login_at, null);
    assert.equal("password_hash" in user, false);

    const list = await fetch(`${server.baseUrl}/api/users`, { headers: authHeaderFor(TestIdentity.USER_MANAGER) });
    const { users } = (await list.json()) as { users: UserDto[] };
    assert.ok(users.some((candidate) => candidate.id === user.id));

    const fetched = await fetch(`${server.baseUrl}/api/users/${user.id}`, {
      headers: authHeaderFor(TestIdentity.USER_MANAGER),
    });
    assert.equal(fetched.status, 200);
    assert.deepEqual(((await fetched.json()) as { user: UserDto }).user, user);

    const login = await postLogin(server.baseUrl, { email: "creator@example.com", password: TEST_DEFAULT_PASSWORD });
    assert.equal(login.status, 200);
    const { token } = (await login.json()) as LoginResponseDto;
    const me = (await (await fetch(`${server.baseUrl}/api/auth/me`, { headers: bearer(token) })).json()) as CurrentUserResponseDto;
    assert.deepEqual(me.user.permissions, [Permission.TASK_APPROVE, Permission.TASK_CREATE]);
  } finally {
    await server.close();
  }
});

test("POST /api/users rejects a duplicate email in different case with 409 EMAIL_ALREADY_REGISTERED", async () => {
  const server = await startAuthTestServer();
  try {
    const body = { email: "dup@example.com", full_name: "Dup", permissions: [Permission.TASK_CREATE] };
    assert.equal((await createUser(server.baseUrl, body)).status, 201);

    const res = await createUser(server.baseUrl, { ...body, email: "DUP@EXAMPLE.COM" });
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as ErrorResponseBody).code, UserErrorCode.EMAIL_ALREADY_REGISTERED);
  } finally {
    await server.close();
  }
});

test("POST /api/users validates its body", async () => {
  const server = await startAuthTestServer();
  try {
    const invalidBodies: Record<string, unknown>[] = [
      { full_name: "No Email", permissions: [Permission.TASK_CREATE] },
      { email: "bad-email", full_name: "Bad", permissions: [Permission.TASK_CREATE] },
      { email: "a@example.com", permissions: [Permission.TASK_CREATE] },
      { email: "a@example.com", full_name: "A", permissions: [] },
      { email: "a@example.com", full_name: "A", permissions: "task:create" },
      { email: "a@example.com", full_name: "A", permissions: ["task:delete"] },
      { email: "a@example.com", full_name: "A", permissions: [Permission.TASK_CREATE, Permission.TASK_CREATE] },
    ];
    for (const body of invalidBodies) {
      const res = await createUser(server.baseUrl, body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  } finally {
    await server.close();
  }
});

test("GET /api/users/:userId returns 404 for an unknown id and 400 for a malformed one", async () => {
  const server = await startAuthTestServer();
  try {
    const missing = await fetch(`${server.baseUrl}/api/users/00000000-0000-4000-8000-0000000000ff`, {
      headers: authHeaderFor(TestIdentity.USER_MANAGER),
    });
    assert.equal(missing.status, 404);
    assert.equal(((await missing.json()) as ErrorResponseBody).code, UserErrorCode.USER_NOT_FOUND);

    const malformed = await fetch(`${server.baseUrl}/api/users/abc`, { headers: authHeaderFor(TestIdentity.USER_MANAGER) });
    assert.equal(malformed.status, 400);
  } finally {
    await server.close();
  }
});
