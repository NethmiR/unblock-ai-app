import { MigrationState } from "../../../data/constants/migration.constant.js";
import { MigrationError } from "../../../errors/migration.error.js";
import type {
  AppliedMigration,
  IMigrationSource,
  IMigrationStore,
  MigrationDefinition,
  MigrationRunOptions,
  MigrationStatusEntry,
} from "../../../lib/types/migration/migration.type.js";

export interface MigrationRunnerOptions<TContext> {
  store: IMigrationStore<TContext>;
  source: IMigrationSource<TContext>;
}

type MigrationStep<TContext> = (definition: MigrationDefinition<TContext>) => Promise<void>;

export class MigrationRunner<TContext> {
  private readonly store: IMigrationStore<TContext>;
  private readonly source: IMigrationSource<TContext>;

  constructor({ store, source }: MigrationRunnerOptions<TContext>) {
    this.store = store;
    this.source = source;
  }

  async status(): Promise<MigrationStatusEntry[]> {
    await this.store.initialize();
    const [definitions, applied] = await Promise.all([this.source.load(), this.store.listApplied()]);
    const appliedByName = new Map(applied.map((record) => [record.name, record]));
    const knownNames = new Set(definitions.map(({ name }) => name));

    const known = definitions.map(({ name }): MigrationStatusEntry => {
      const record = appliedByName.get(name);
      return record
        ? { name, state: MigrationState.APPLIED, batch: record.batch, appliedAt: record.appliedAt }
        : { name, state: MigrationState.PENDING, batch: null, appliedAt: null };
    });

    const missing = applied
      .filter(({ name }) => !knownNames.has(name))
      .map((record): MigrationStatusEntry => ({ ...record, state: MigrationState.MISSING }));

    return [...known, ...missing].sort((a, b) => a.name.localeCompare(b.name));
  }

  up(options: MigrationRunOptions = {}): Promise<string[]> {
    return this.withLock(async () => {
      const [definitions, applied] = await Promise.all([this.source.load(), this.store.listApplied()]);
      const appliedNames = new Set(applied.map(({ name }) => name));
      const pending = this.limit(
        definitions.filter(({ name }) => !appliedNames.has(name)),
        options.step,
      );
      const batch = applied.reduce((max, record) => Math.max(max, record.batch), 0) + 1;

      return this.run(pending, "up", (definition) => this.store.apply(definition, batch));
    });
  }

  down(options: MigrationRunOptions = {}): Promise<string[]> {
    return this.withLock(async () => {
      const newestFirst = [...(await this.store.listApplied())].reverse();
      const lastBatch = newestFirst[0]?.batch;
      const targets = options.step
        ? this.limit(newestFirst, options.step)
        : newestFirst.filter(({ batch }) => batch === lastBatch);

      return this.revert(targets);
    });
  }

  reset(): Promise<string[]> {
    return this.withLock(async () => this.revert([...(await this.store.listApplied())].reverse()));
  }

  async unlock(): Promise<void> {
    await this.store.initialize();
    await this.store.releaseLock();
  }

  private async revert(targets: AppliedMigration[]): Promise<string[]> {
    const definitions = await this.source.load();
    const byName = new Map(definitions.map((definition) => [definition.name, definition]));
    const missing = targets.filter(({ name }) => !byName.has(name)).map(({ name }) => name);

    if (missing.length > 0) {
      throw new MigrationError("Cannot revert migrations whose files no longer exist", {
        details: { missing },
      });
    }

    const ordered = targets.map(({ name }) => byName.get(name)!);
    return this.run(ordered, "down", (definition) => this.store.revert(definition));
  }

  private async run(
    definitions: MigrationDefinition<TContext>[],
    direction: "up" | "down",
    step: MigrationStep<TContext>,
  ): Promise<string[]> {
    const completed: string[] = [];
    for (const definition of definitions) {
      try {
        await step(definition);
      } catch (err) {
        throw new MigrationError(`Migration ${definition.name} failed while running ${direction}`, {
          cause: err,
          details: { completed },
        });
      }
      completed.push(definition.name);
    }
    return completed;
  }

  private limit<T>(items: T[], step?: number): T[] {
    return step === undefined ? items : items.slice(0, step);
  }

  private async withLock<T>(task: () => Promise<T>): Promise<T> {
    await this.store.initialize();
    await this.store.acquireLock();
    try {
      return await task();
    } finally {
      await this.store.releaseLock();
    }
  }
}
