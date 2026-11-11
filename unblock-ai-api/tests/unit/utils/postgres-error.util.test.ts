import test from "node:test";
import assert from "node:assert/strict";
import { isPostgresError } from "../../../src/utils/database/postgres-error.util.js";
import { PostgresConstraint, PostgresErrorCode } from "../../../src/data/constants/postgres.constant.js";
import { DatabaseError } from "../../../src/errors/database.error.js";

function driverError(code: string, constraint?: string): Error {
  return Object.assign(new Error("driver"), { code, constraint });
}

test("isPostgresError matches a driver error directly", () => {
  assert.equal(isPostgresError(driverError("23505"), PostgresErrorCode.UNIQUE_VIOLATION), true);
});

test("isPostgresError walks the cause chain of a wrapped error", () => {
  const wrapped = new DatabaseError("Postgres query failed", {
    cause: driverError("23505", PostgresConstraint.USERS_EMAIL_KEY),
  });
  assert.equal(
    isPostgresError(wrapped, PostgresErrorCode.UNIQUE_VIOLATION, PostgresConstraint.USERS_EMAIL_KEY),
    true,
  );
});

test("isPostgresError rejects a different code or constraint", () => {
  const wrapped = new DatabaseError("failed", { cause: driverError("23505", "other_key") });
  assert.equal(isPostgresError(wrapped, PostgresErrorCode.CHECK_VIOLATION), false);
  assert.equal(
    isPostgresError(wrapped, PostgresErrorCode.UNIQUE_VIOLATION, PostgresConstraint.USERS_EMAIL_KEY),
    false,
  );
  assert.equal(isPostgresError(new Error("plain"), PostgresErrorCode.UNIQUE_VIOLATION), false);
});
