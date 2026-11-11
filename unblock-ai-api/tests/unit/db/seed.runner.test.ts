import test from "node:test";
import assert from "node:assert/strict";
import { SeedRunner } from "../../../src/db/seed/core/seed.runner.js";
import { SeedError } from "../../../src/errors/seed.error.js";
import { SeedEntity, SeedOutcomeStatus } from "../../../src/data/constants/seed.constant.js";
import type { ISeedSource, SeederDefinition } from "../../../src/lib/types/seed/seed.type.js";

interface FakeContext {
  calls: string[];
}

function seeder(name: string, options: { fail?: boolean } = {}): SeederDefinition<FakeContext> {
  return {
    name,
    seeder: {
      async run(context) {
        context.calls.push(name);
        if (options.fail) throw new Error(`${name} exploded`);
        return [{ entity: SeedEntity.USER, key: name, status: SeedOutcomeStatus.CREATED }];
      },
    },
  };
}

function runner(definitions: SeederDefinition<FakeContext>[]): { runner: SeedRunner<FakeContext>; context: FakeContext; contextCreations: () => number } {
  const context: FakeContext = { calls: [] };
  let creations = 0;
  const source: ISeedSource<FakeContext> = { load: async () => definitions };
  return {
    runner: new SeedRunner({
      source,
      createContext: async () => {
        creations += 1;
        return context;
      },
    }),
    context,
    contextCreations: () => creations,
  };
}

test("run executes every seeder in order and reports outcomes", async () => {
  const { runner: seedRunner, context } = runner([seeder("20260101000000_a"), seeder("20260102000000_b")]);
  const reports = await seedRunner.run();

  assert.deepEqual(context.calls, ["20260101000000_a", "20260102000000_b"]);
  assert.deepEqual(reports.map(({ seeder: name }) => name), ["20260101000000_a", "20260102000000_b"]);
  assert.equal(reports[0]?.outcomes[0]?.status, SeedOutcomeStatus.CREATED);
});

test("run with only executes just the named seeder", async () => {
  const { runner: seedRunner, context } = runner([seeder("20260101000000_a"), seeder("20260102000000_b")]);
  await seedRunner.run({ only: "20260102000000_b" });
  assert.deepEqual(context.calls, ["20260102000000_b"]);
});

test("run with an unknown only name throws SeedError without creating a context", async () => {
  const { runner: seedRunner, contextCreations } = runner([seeder("20260101000000_a")]);
  await assert.rejects(seedRunner.run({ only: "missing" }), SeedError);
  assert.equal(contextCreations(), 0);
});

test("a failing seeder stops the run and reports what completed", async () => {
  const { runner: seedRunner, context } = runner([
    seeder("20260101000000_a"),
    seeder("20260102000000_b", { fail: true }),
    seeder("20260103000000_c"),
  ]);

  await assert.rejects(
    seedRunner.run(),
    (err: unknown) =>
      err instanceof SeedError &&
      JSON.stringify(err.details) === JSON.stringify({ completed: ["20260101000000_a"] }),
  );
  assert.deepEqual(context.calls, ["20260101000000_a", "20260102000000_b"]);
});

test("list returns seeder names without creating a context", async () => {
  const { runner: seedRunner, contextCreations } = runner([seeder("20260101000000_a")]);
  assert.deepEqual(await seedRunner.list(), ["20260101000000_a"]);
  assert.equal(contextCreations(), 0);
});

test("run with no seeders returns an empty report without creating a context", async () => {
  const { runner: seedRunner, contextCreations } = runner([]);
  assert.deepEqual(await seedRunner.run(), []);
  assert.equal(contextCreations(), 0);
});
