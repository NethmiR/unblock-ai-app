import test from "node:test";
import assert from "node:assert/strict";
import { TaskModel } from "../../../src/models/task.model.js";
import { ValidationError } from "../../../src/errors/validation.error.js";

test("findCreatorById rejects a malformed id as a ValidationError before touching the database", async () => {
  await assert.rejects(new TaskModel().findCreatorById("not-an-objectid"), ValidationError);
});
