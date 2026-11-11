import test from "node:test";
import assert from "node:assert/strict";
import { isValidEmail, normalizeEmail } from "../../../src/utils/user/email.util.js";
import { USER_FIELD_LIMIT } from "../../../src/data/constants/user.constant.js";

test("normalizeEmail trims and lower-cases", () => {
  assert.equal(normalizeEmail("  Jane.Doe@Example.COM "), "jane.doe@example.com");
});

test("isValidEmail accepts a well-formed address", () => {
  assert.equal(isValidEmail("jane@example.com"), true);
});

test("isValidEmail rejects malformed addresses", () => {
  for (const value of ["", "jane", "jane@", "@example.com", "jane@example", "ja ne@example.com"]) {
    assert.equal(isValidEmail(value), false, value);
  }
});

test("isValidEmail rejects an address over the maximum length", () => {
  const local = "a".repeat(USER_FIELD_LIMIT.EMAIL_MAX_LENGTH);
  assert.equal(isValidEmail(`${local}@example.com`), false);
});
