import test from "node:test";
import assert from "node:assert/strict";
import { hasAnyPermission, isPermission } from "../../../src/utils/auth/permission.util.js";
import { Permission } from "../../../src/data/constants/permission.constant.js";

test("isPermission accepts every defined permission", () => {
  for (const permission of Object.values(Permission)) assert.equal(isPermission(permission), true);
});

test("isPermission rejects unknown values and non-strings", () => {
  for (const value of ["workflow:delete", "", 1, null, undefined, {}]) assert.equal(isPermission(value), false);
});

test("hasAnyPermission is true when any required permission is granted", () => {
  assert.equal(
    hasAnyPermission([Permission.TASK_CREATE], [Permission.WORKFLOW_MANAGE, Permission.TASK_CREATE]),
    true,
  );
});

test("hasAnyPermission is false when none of the required permissions is granted", () => {
  assert.equal(hasAnyPermission([Permission.TASK_CREATE], [Permission.USER_MANAGE]), false);
  assert.equal(hasAnyPermission([], [Permission.USER_MANAGE]), false);
});
