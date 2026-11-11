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
import { TestIdentity, authHeaderFor } from "../helpers/test-server.helper.js";
import type { LoginResponseDto } from "../../src/lib/types/auth/auth.type.js";
import type { UserSessionDto } from "../../src/lib/types/user-session/user-session.type.js";
import type { ErrorResponseBody } from "../../src/lib/types/http/http.type.js";

async function login(baseUrl: string, userAgent: string): Promise<LoginResponseDto> {
  const res = await postLogin(baseUrl, { email: "login-user@example.com", password: LOGIN_PASSWORD }, userAgent);
  assert.equal(res.status, 200);
  return (await res.json()) as LoginResponseDto;
}

async function listSessions(baseUrl: string, token: string): Promise<UserSessionDto[]> {
  const res = await fetch(`${baseUrl}/api/auth/sessions`, { headers: bearer(token) });
  assert.equal(res.status, 200);
  return ((await res.json()) as { sessions: UserSessionDto[] }).sessions;
}

test("user sessions: list, revoke one, revoke others and log out", async () => {
  const server = await startAuthTestServer({ users: [await loginUser()] });
  try {
    const laptop = await login(server.baseUrl, "Laptop Browser");
    const phone = await login(server.baseUrl, "Phone Browser");
    const tablet = await login(server.baseUrl, "Tablet Browser");

    const sessions = await listSessions(server.baseUrl, laptop.token);
    assert.equal(sessions.length, 3);
    const current = sessions.filter((session) => session.is_current);
    assert.equal(current.length, 1);
    assert.equal(current[0]?.user_agent, "Laptop Browser");

    const phoneSession = sessions.find((session) => session.user_agent === "Phone Browser")!;
    const revoke = await fetch(`${server.baseUrl}/api/auth/sessions/${phoneSession.id}`, {
      method: "DELETE",
      headers: bearer(laptop.token),
    });
    assert.equal(revoke.status, 204);
    assert.equal((await fetch(`${server.baseUrl}/api/auth/me`, { headers: bearer(phone.token) })).status, 401);

    const others = await fetch(`${server.baseUrl}/api/auth/sessions/others`, {
      method: "DELETE",
      headers: bearer(laptop.token),
    });
    assert.equal(others.status, 200);
    assert.deepEqual(await others.json(), { revoked_count: 1 });
    assert.equal((await fetch(`${server.baseUrl}/api/auth/me`, { headers: bearer(tablet.token) })).status, 401);

    const remaining = await listSessions(server.baseUrl, laptop.token);
    assert.deepEqual(remaining.map((session) => session.user_agent), ["Laptop Browser"]);

    await fetch(`${server.baseUrl}/api/auth/logout`, { method: "POST", headers: bearer(laptop.token) });
    assert.equal((await fetch(`${server.baseUrl}/api/auth/sessions`, { headers: bearer(laptop.token) })).status, 401);
  } finally {
    await server.close();
  }
});

test("DELETE /api/auth/sessions/:sessionId cannot revoke another user's session", async () => {
  const server = await startAuthTestServer({ users: [await loginUser()] });
  try {
    const own = await login(server.baseUrl, "Own Browser");
    const ownSessionId = (await listSessions(server.baseUrl, own.token))[0]!.id;

    const res = await fetch(`${server.baseUrl}/api/auth/sessions/${ownSessionId}`, {
      method: "DELETE",
      headers: authHeaderFor(TestIdentity.TASK_CREATOR),
    });
    assert.equal(res.status, 404);
    assert.equal(((await res.json()) as ErrorResponseBody).code, AuthErrorCode.USER_SESSION_NOT_FOUND);
    assert.equal((await fetch(`${server.baseUrl}/api/auth/me`, { headers: bearer(own.token) })).status, 200);
  } finally {
    await server.close();
  }
});

test("DELETE /api/auth/sessions/:sessionId rejects a non-UUID id with 400", async () => {
  const server = await startAuthTestServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/auth/sessions/not-a-uuid`, {
      method: "DELETE",
      headers: authHeaderFor(TestIdentity.TASK_CREATOR),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("GET /api/auth/sessions only lists the caller's own sessions", async () => {
  const server = await startAuthTestServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/auth/sessions`, { headers: authHeaderFor(TestIdentity.TASK_CREATOR) });
    const sessions = ((await res.json()) as { sessions: UserSessionDto[] }).sessions;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.is_current, true);
  } finally {
    await server.close();
  }
});

test("user session routes require authentication", async () => {
  const server = await startAuthTestServer();
  try {
    assert.equal((await fetch(`${server.baseUrl}/api/auth/sessions`)).status, 401);
    assert.equal((await fetch(`${server.baseUrl}/api/auth/sessions/others`, { method: "DELETE" })).status, 401);
  } finally {
    await server.close();
  }
});
