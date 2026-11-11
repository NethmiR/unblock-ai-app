import test from "node:test";
import assert from "node:assert/strict";
import {
  LOGIN_PASSWORD,
  bearer,
  loginUser,
  postLogin,
  startAuthTestServer,
} from "../helpers/auth-test-server.helper.js";
import { AuthErrorCode } from "../../src/data/constants/auth.constant.js";
import { Permission } from "../../src/data/constants/permission.constant.js";
import { UserStatus } from "../../src/data/constants/user.constant.js";
import type { CurrentUserResponseDto, LoginResponseDto } from "../../src/lib/types/auth/auth.type.js";
import type { ErrorResponseBody } from "../../src/lib/types/http/http.type.js";

test("POST /api/auth/login with correct credentials returns a token and the user", async () => {
  const server = await startAuthTestServer({ users: [await loginUser()] });
  try {
    const res = await postLogin(server.baseUrl, { email: "  LOGIN-USER@example.com ", password: LOGIN_PASSWORD });
    assert.equal(res.status, 200);
    const body = (await res.json()) as LoginResponseDto;
    assert.ok(body.token.length > 0);
    assert.ok(Date.parse(body.expires_at) > Date.now());
    assert.deepEqual(body.user, {
      id: "00000000-0000-4000-8000-0000000000aa",
      email: "login-user@example.com",
      full_name: "Login User",
      permissions: [Permission.TASK_CREATE],
    });
    assert.equal("password_hash" in body.user, false);
  } finally {
    await server.close();
  }
});

test("POST /api/auth/login with a wrong password returns 401 INVALID_CREDENTIALS", async () => {
  const server = await startAuthTestServer({ users: [await loginUser()] });
  try {
    const res = await postLogin(server.baseUrl, { email: "login-user@example.com", password: "wrong" });
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as ErrorResponseBody).code, AuthErrorCode.INVALID_CREDENTIALS);
  } finally {
    await server.close();
  }
});

test("POST /api/auth/login with an unknown email returns the same 401 INVALID_CREDENTIALS", async () => {
  const server = await startAuthTestServer();
  try {
    const res = await postLogin(server.baseUrl, { email: "nobody@example.com", password: "whatever" });
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as ErrorResponseBody).code, AuthErrorCode.INVALID_CREDENTIALS);
  } finally {
    await server.close();
  }
});

test("POST /api/auth/login rejects a missing email or password with 400", async () => {
  const server = await startAuthTestServer();
  try {
    assert.equal((await postLogin(server.baseUrl, { password: "x" })).status, 400);
    assert.equal((await postLogin(server.baseUrl, { email: "a@example.com" })).status, 400);
  } finally {
    await server.close();
  }
});

test("POST /api/auth/login for a disabled account returns 403 ACCOUNT_DISABLED", async () => {
  const server = await startAuthTestServer({ users: [await loginUser({ status: UserStatus.DISABLED })] });
  try {
    const res = await postLogin(server.baseUrl, { email: "login-user@example.com", password: LOGIN_PASSWORD });
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as ErrorResponseBody).code, AuthErrorCode.ACCOUNT_DISABLED);
  } finally {
    await server.close();
  }
});

test("POST /api/auth/login locks the account after the configured failures, even for the right password", async () => {
  const server = await startAuthTestServer({
    users: [await loginUser()],
    authConfig: { sessionTtlHours: 12, maxFailedAttempts: 2, lockoutDurationMinutes: 15 },
  });
  try {
    const first = await postLogin(server.baseUrl, { email: "login-user@example.com", password: "wrong" });
    assert.equal(((await first.json()) as ErrorResponseBody).code, AuthErrorCode.INVALID_CREDENTIALS);

    const second = await postLogin(server.baseUrl, { email: "login-user@example.com", password: "wrong" });
    assert.equal(second.status, 403);
    assert.equal(((await second.json()) as ErrorResponseBody).code, AuthErrorCode.ACCOUNT_LOCKED);

    const correct = await postLogin(server.baseUrl, { email: "login-user@example.com", password: LOGIN_PASSWORD });
    assert.equal(correct.status, 403);
    assert.equal(((await correct.json()) as ErrorResponseBody).code, AuthErrorCode.ACCOUNT_LOCKED);
  } finally {
    await server.close();
  }
});

test("GET /api/auth/me returns the user and the current session", async () => {
  const server = await startAuthTestServer({ users: [await loginUser()] });
  try {
    const login = (await (
      await postLogin(server.baseUrl, { email: "login-user@example.com", password: LOGIN_PASSWORD })
    ).json()) as LoginResponseDto;

    const res = await fetch(`${server.baseUrl}/api/auth/me`, { headers: bearer(login.token) });
    assert.equal(res.status, 200);
    const body = (await res.json()) as CurrentUserResponseDto;
    assert.equal(body.user.email, "login-user@example.com");
    assert.equal(body.session.expires_at, login.expires_at);
  } finally {
    await server.close();
  }
});

test("GET /api/auth/me without a valid token returns 401 AUTHENTICATION_REQUIRED", async () => {
  const server = await startAuthTestServer();
  try {
    for (const headers of [{}, bearer("tampered-or-unknown")]) {
      const res = await fetch(`${server.baseUrl}/api/auth/me`, { headers });
      assert.equal(res.status, 401);
      assert.equal(((await res.json()) as ErrorResponseBody).code, AuthErrorCode.AUTHENTICATION_REQUIRED);
    }
  } finally {
    await server.close();
  }
});

test("POST /api/auth/logout revokes the session so the token stops working", async () => {
  const server = await startAuthTestServer({ users: [await loginUser()] });
  try {
    const login = (await (
      await postLogin(server.baseUrl, { email: "login-user@example.com", password: LOGIN_PASSWORD })
    ).json()) as LoginResponseDto;

    const logout = await fetch(`${server.baseUrl}/api/auth/logout`, { method: "POST", headers: bearer(login.token) });
    assert.equal(logout.status, 204);

    const me = await fetch(`${server.baseUrl}/api/auth/me`, { headers: bearer(login.token) });
    assert.equal(me.status, 401);
  } finally {
    await server.close();
  }
});
