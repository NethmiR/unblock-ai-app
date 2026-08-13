import test from "node:test";
import assert from "node:assert/strict";
import {
  requireNonEmptyString,
  requireObject,
  requireOneOf,
  optionalString,
  optionalObject,
  optionalPositiveInt,
} from "../../../src/utils/http/request-validator.util.js";
import { ValidationError } from "../../../src/errors/validation.error.js";

test("requireNonEmptyString returns the value when present", () => {
  assert.equal(requireNonEmptyString({ text: "hello" }, "text"), "hello");
});

test("requireNonEmptyString throws the default message for a missing field", () => {
  assert.throws(
    () => requireNonEmptyString({}, "text"),
    (err: unknown) => err instanceof ValidationError && err.message === "Body must include a non-empty 'text' field",
  );
});

test("requireNonEmptyString throws for a whitespace-only value", () => {
  assert.throws(() => requireNonEmptyString({ text: "   " }, "text"), ValidationError);
});

test("requireNonEmptyString honours a custom message", () => {
  assert.throws(
    () => requireNonEmptyString({}, "text", "custom message"),
    (err: unknown) => err instanceof ValidationError && err.message === "custom message",
  );
});

test("requireObject returns the object when present", () => {
  assert.deepEqual(requireObject({ workflow: { a: 1 } }, "workflow"), { a: 1 });
});

test("requireObject throws 'Body must include a <field> object' for a missing field", () => {
  assert.throws(
    () => requireObject({}, "workflow"),
    (err: unknown) => err instanceof ValidationError && err.message === "Body must include a 'workflow' object",
  );
});

test("requireObject rejects an array", () => {
  assert.throws(() => requireObject({ workflow: [] }, "workflow"), ValidationError);
});

test("requireOneOf returns the value when it is in the allowed set", () => {
  assert.equal(requireOneOf({ review_status: "confirmed" }, "review_status", ["confirmed", "rejected"] as const), "confirmed");
});

test("requireOneOf throws naming the allowed values", () => {
  assert.throws(
    () => requireOneOf({ review_status: "bogus" }, "review_status", ["confirmed", "rejected"] as const),
    (err: unknown) =>
      err instanceof ValidationError && err.message === "review_status must be one of: confirmed, rejected",
  );
});

test("optionalString returns null when the field is absent", () => {
  assert.equal(optionalString({}, "title"), null);
});

test("optionalString coerces a present value to a string", () => {
  assert.equal(optionalString({ title: 5 }, "title"), "5");
});

test("optionalObject returns null when the field is absent", () => {
  assert.equal(optionalObject({}, "requester_context"), null);
});

test("optionalObject returns null when the field is explicitly null", () => {
  assert.equal(optionalObject({ requester_context: null }, "requester_context"), null);
});

test("optionalObject preserves the object structure instead of stringifying it", () => {
  assert.deepEqual(optionalObject({ requester_context: { actor_type: "staff", department: "IT" } }, "requester_context"), {
    actor_type: "staff",
    department: "IT",
  });
});

test("optionalObject rejects an array", () => {
  assert.throws(() => optionalObject({ requester_context: [] }, "requester_context"), ValidationError);
});

test("optionalObject rejects a non-object value", () => {
  assert.throws(
    () => optionalObject({ requester_context: "staff" }, "requester_context"),
    (err: unknown) => err instanceof ValidationError && err.message === "Body must include a 'requester_context' object",
  );
});

test("optionalPositiveInt returns undefined for an absent value", () => {
  assert.equal(optionalPositiveInt(undefined, "version"), undefined);
});

test("optionalPositiveInt parses a valid positive integer", () => {
  assert.equal(optionalPositiveInt("3", "version"), 3);
});

test("optionalPositiveInt throws for zero or negative values", () => {
  assert.throws(() => optionalPositiveInt("0", "version"), ValidationError);
  assert.throws(() => optionalPositiveInt("-1", "version"), ValidationError);
});

test("optionalPositiveInt throws for a non-integer value", () => {
  assert.throws(() => optionalPositiveInt("1.5", "version"), ValidationError);
});
