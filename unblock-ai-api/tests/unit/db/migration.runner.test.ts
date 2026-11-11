import test from "node:test";
import assert from "node:assert/strict";
import { MigrationRunner } from "../../../src/db/migration/core/migration.runner.js";
import { MigrationState } from "../../../src/data/constants/migration.constant.js";
import { MigrationError } from "../../../src/errors/migration.error.js";
import {
  FakeMigrationStore,
  fakeMigration,
  fakeSource,
  type FakeMigrationContext,
} from "../../helpers/fake-migration-store.helper.js";
import type { MigrationDefinition } from "../../../src/lib/types/migration/migration.type.js";

function createRunner(definitions: MigrationDefinition<FakeMigrationContext>[]) {
  const store = new FakeMigrationStore();
  const runner = new MigrationRunner({ store, source: fakeSource(definitions) });
  return { store, runner };
}

const first = fakeMigration("20260101000000_first");
const second = fakeMigration("20260102000000_second");
const third = fakeMigration("20260103000000_third");

test("up applies every pending migration in order as one batch", async () => {
  const { store, runner } = createRunner([first, second]);

  assert.deepEqual(await runner.up(), [first.name, second.name]);
  assert.deepEqual(store.context.log, [`up:${first.name}`, `up:${second.name}`]);
  assert.deepEqual(store.applied.map(({ batch }) => batch), [1, 1]);
  assert.equal(store.locked, false);
});

test("up with nothing pending applies nothing", async () => {
  const { runner } = createRunner([first]);
  await runner.up();

  assert.deepEqual(await runner.up(), []);
});

test("up with step applies only that many migrations", async () => {
  const { store, runner } = createRunner([first, second, third]);

  assert.deepEqual(await runner.up({ step: 2 }), [first.name, second.name]);
  assert.deepEqual(await runner.up(), [third.name]);
  assert.deepEqual(store.applied.map(({ batch }) => batch), [1, 1, 2]);
});

test("down reverts only the last batch, newest first", async () => {
  const { store, runner } = createRunner([first, second, third]);
  await runner.up({ step: 1 });
  await runner.up();

  assert.deepEqual(await runner.down(), [third.name, second.name]);
  assert.deepEqual(store.applied.map(({ name }) => name), [first.name]);
});

test("down with step reverts that many migrations across batches", async () => {
  const { runner } = createRunner([first, second, third]);
  await runner.up({ step: 1 });
  await runner.up();

  assert.deepEqual(await runner.down({ step: 3 }), [third.name, second.name, first.name]);
});

test("reset reverts every applied migration", async () => {
  const { store, runner } = createRunner([first, second, third]);
  await runner.up({ step: 1 });
  await runner.up();

  assert.deepEqual(await runner.reset(), [third.name, second.name, first.name]);
  assert.equal(store.applied.length, 0);
});

test("status reports applied, pending and missing migrations", async () => {
  const { store, runner } = createRunner([first, second]);
  await runner.up({ step: 1 });
  store.applied.push({ name: "20251231000000_removed", batch: 1, appliedAt: new Date() });

  const states = (await runner.status()).map(({ name, state }) => [name, state]);
  assert.deepEqual(states, [
    ["20251231000000_removed", MigrationState.MISSING],
    [first.name, MigrationState.APPLIED],
    [second.name, MigrationState.PENDING],
  ]);
});

test("a failing migration stops the run, reports what completed and releases the lock", async () => {
  const broken = fakeMigration("20260102000000_broken", { failOnUp: true });
  const { store, runner } = createRunner([first, broken, third]);

  await assert.rejects(runner.up(), (err: unknown) => {
    assert.ok(err instanceof MigrationError);
    assert.match(err.message, /20260102000000_broken failed while running up/);
    assert.deepEqual(err.details, { completed: [first.name] });
    return true;
  });
  assert.deepEqual(store.applied.map(({ name }) => name), [first.name]);
  assert.equal(store.locked, false);
});

test("down refuses to revert a migration whose file is missing", async () => {
  const { store, runner } = createRunner([first]);
  store.applied.push({ name: "20251231000000_removed", batch: 1, appliedAt: new Date() });

  await assert.rejects(runner.down({ step: 1 }), MigrationError);
});

test("a held lock blocks a second run", async () => {
  const { store, runner } = createRunner([first]);
  store.locked = true;

  await assert.rejects(runner.up(), /locked/);
  await runner.unlock();
  assert.deepEqual(await runner.up(), [first.name]);
});
