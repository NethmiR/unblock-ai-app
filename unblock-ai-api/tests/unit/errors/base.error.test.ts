import test from "node:test";
import assert from "node:assert/strict";
import { ValidationError } from "../../../src/errors/validation.error.js";
import { NotFoundError } from "../../../src/errors/not-found.error.js";
import { ConflictError } from "../../../src/errors/conflict.error.js";
import { BaseError } from "../../../src/errors/base.error.js";

test("subclasses carry their declared statusCode", () => {
  assert.equal(new ValidationError("bad").statusCode, 400);
  assert.equal(new NotFoundError("missing").statusCode, 404);
  assert.equal(new ConflictError("conflict").statusCode, 409);
});

test("code defaults to a screaming-snake-case rendering of the class name", () => {
  assert.equal(new ValidationError("bad").code, "VALIDATION_ERROR");
  assert.equal(new NotFoundError("missing").code, "NOT_FOUND");
});

test("toJSON returns error, code, and details", () => {
  const err = new ValidationError("bad body", { details: { field: "x" } });
  assert.deepEqual(err.toJSON(), { error: "bad body", code: "VALIDATION_ERROR", details: { field: "x" } });
});

test("toJSON defaults details to null when not provided", () => {
  assert.deepEqual(new NotFoundError("missing").toJSON().details, null);
});

test("subclasses are instances of BaseError and Error", () => {
  const err = new ValidationError("bad");
  assert.ok(err instanceof BaseError);
  assert.ok(err instanceof Error);
});

test("name is set to the concrete subclass name", () => {
  assert.equal(new ValidationError("bad").name, "ValidationError");
  assert.equal(new ConflictError("conflict").name, "ConflictError");
});

test("NotFoundError.of formats a standard 'resource not found' message", () => {
  assert.equal(NotFoundError.of("Workflow", "wf_1").message, "Workflow 'wf_1' not found");
});

test("isOperational defaults to true", () => {
  assert.equal(new ValidationError("bad").isOperational, true);
});
