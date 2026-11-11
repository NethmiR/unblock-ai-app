import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMigrationFileName,
  parseMigrationFileName,
  toMigrationSlug,
  toMigrationTimestamp,
} from "../../../src/utils/migration/migration-file.util.js";
import { MigrationError } from "../../../src/errors/migration.error.js";

const date = new Date("2026-11-11T09:05:03.250Z");

test("timestamps are 14-digit UTC values", () => {
  assert.equal(toMigrationTimestamp(date), "20261111090503");
});

test("names are normalised to kebab-case slugs", () => {
  assert.equal(toMigrationSlug("Add task priority"), "add-task-priority");
  assert.equal(toMigrationSlug("addTaskPriority"), "add-task-priority");
  assert.equal(toMigrationSlug("  add__task--priority!  "), "add-task-priority");
});

test("built file names follow the migration pattern", () => {
  assert.equal(buildMigrationFileName("add task priority", date), "20261111090503_add-task-priority.migration.ts");
});

test("building a file name without a usable name fails", () => {
  assert.throws(() => buildMigrationFileName(" -- ", date), MigrationError);
});

test("migration files parse into their name and extension", () => {
  assert.deepEqual(parseMigrationFileName("20261111090503_add-task-priority.migration.js"), {
    name: "20261111090503_add-task-priority",
    timestamp: "20261111090503",
    slug: "add-task-priority",
    extension: "js",
  });
});

test("non-migration files are ignored", () => {
  for (const fileName of [
    "20261111090503_add-task-priority.migration.d.ts",
    "20261111090503_add-task-priority.migration.js.map",
    "2026_add-task-priority.migration.ts",
    "20261111090503_Add_Task.migration.ts",
    "README.md",
  ]) {
    assert.equal(parseMigrationFileName(fileName), null, fileName);
  }
});
