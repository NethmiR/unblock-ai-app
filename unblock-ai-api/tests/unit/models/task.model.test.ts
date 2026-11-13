import test from "node:test";
import assert from "node:assert/strict";
import { escapeRegex, TaskModel } from "../../../src/models/task.model.js";

test("findCreatorById returns null for a malformed id without touching the database", async () => {
  assert.equal(await new TaskModel().findCreatorById("not-an-objectid"), null);
});

test("findById returns null for a malformed id without touching the database", async () => {
  assert.equal(await new TaskModel().findById("not-an-objectid"), null);
});

test("search text is escaped before it becomes a regular expression", () => {
  assert.equal(escapeRegex("TASK-2026.(1)*"), String.raw`TASK-2026\.\(1\)\*`);
  assert.ok(new RegExp(escapeRegex("a.b")).test("a.b"));
  assert.ok(!new RegExp(escapeRegex("a.b")).test("axb"));
});
