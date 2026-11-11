import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { requireAnyPermission } from "../../../src/middlewares/require-permission.middleware.js";
import { requireAuthentication } from "../../../src/middlewares/require-authentication.middleware.js";
import { Permission } from "../../../src/data/constants/permission.constant.js";
import { AuthErrorCode } from "../../../src/data/constants/auth.constant.js";
import { ForbiddenError } from "../../../src/errors/forbidden.error.js";
import { UnauthorizedError } from "../../../src/errors/unauthorized.error.js";
import type { AuthContext } from "../../../src/lib/types/auth/auth.type.js";

function requestWith(permissions: Permission[] | null): Request {
  if (permissions === null) return {} as Request;
  const auth: AuthContext = {
    user: { id: "u-1", email: "u@example.com", fullName: "U", permissions },
    session: { id: "s-1", expiresAt: new Date(Date.now() + 60_000) },
  };
  return { auth } as Request;
}

function run(handler: ReturnType<typeof requireAnyPermission>, req: Request): boolean {
  let called = false;
  handler(req, {} as Response, () => {
    called = true;
  });
  return called;
}

test("requireAnyPermission rejects an unauthenticated request with 401 AUTHENTICATION_REQUIRED", () => {
  assert.throws(
    () => run(requireAnyPermission(Permission.USER_MANAGE), requestWith(null)),
    (err: unknown) => err instanceof UnauthorizedError && err.code === AuthErrorCode.AUTHENTICATION_REQUIRED,
  );
});

test("requireAnyPermission rejects a user without any listed permission with 403 PERMISSION_DENIED", () => {
  assert.throws(
    () => run(requireAnyPermission(Permission.USER_MANAGE), requestWith([Permission.TASK_CREATE])),
    (err: unknown) => err instanceof ForbiddenError && err.code === AuthErrorCode.PERMISSION_DENIED,
  );
});

test("requireAnyPermission passes when the user holds any one listed permission", () => {
  const handler = requireAnyPermission(Permission.WORKFLOW_MANAGE, Permission.TASK_CREATE);
  assert.equal(run(handler, requestWith([Permission.TASK_CREATE])), true);
});

test("requireAuthentication passes any authenticated user and rejects anonymous requests", () => {
  assert.equal(run(requireAuthentication(), requestWith([Permission.TASK_APPROVE])), true);
  assert.throws(() => run(requireAuthentication(), requestWith(null)), UnauthorizedError);
});
