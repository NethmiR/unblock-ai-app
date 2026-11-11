import test from "node:test";
import assert from "node:assert/strict";
import { buildSeedFileName, parseSeedFileName } from "../../../src/utils/seed/seed-file.util.js";
import { SeedError } from "../../../src/errors/seed.error.js";

const date = new Date("2026-11-11T09:05:03.250Z");

test("buildSeedFileName produces a timestamped kebab-case seeder file name", () => {
  assert.equal(buildSeedFileName("Administrator User", date), "20261111090503_administrator-user.seeder.ts");
});

test("buildSeedFileName rejects a name without letters or digits", () => {
  assert.throws(() => buildSeedFileName("  --  ", date), SeedError);
});

test("parseSeedFileName reads the parts of a valid file name", () => {
  assert.deepEqual(parseSeedFileName("20261111090503_administrator-user.seeder.js"), {
    name: "20261111090503_administrator-user",
    timestamp: "20261111090503",
    slug: "administrator-user",
    extension: "js",
  });
});

test("parseSeedFileName rejects anything that is not a seeder file", () => {
  for (const name of ["administrator-user.seeder.ts", "20261111090503_x.migration.ts", "20261111090503_Bad.seeder.ts"]) {
    assert.equal(parseSeedFileName(name), null, name);
  }
});
