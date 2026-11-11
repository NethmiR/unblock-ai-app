import type {
  AppliedMigration,
  IMigrationSource,
  IMigrationStore,
  Migration,
  MigrationDefinition,
} from "../../src/lib/types/migration/migration.type.js";

export interface FakeMigrationContext {
  log: string[];
}

export class FakeMigrationStore implements IMigrationStore<FakeMigrationContext> {
  readonly context: FakeMigrationContext = { log: [] };
  readonly applied: AppliedMigration[] = [];
  locked = false;
  closed = false;

  async initialize(): Promise<void> {}

  async acquireLock(): Promise<void> {
    if (this.locked) throw new Error("locked");
    this.locked = true;
  }

  async releaseLock(): Promise<void> {
    this.locked = false;
  }

  async listApplied(): Promise<AppliedMigration[]> {
    return [...this.applied].sort((a, b) => a.batch - b.batch || a.name.localeCompare(b.name));
  }

  async apply({ name, migration }: MigrationDefinition<FakeMigrationContext>, batch: number): Promise<void> {
    await migration.up(this.context);
    this.applied.push({ name, batch, appliedAt: new Date() });
  }

  async revert({ name, migration }: MigrationDefinition<FakeMigrationContext>): Promise<void> {
    await migration.down(this.context);
    this.applied.splice(this.applied.findIndex((record) => record.name === name), 1);
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

export function fakeMigration(name: string, options: { failOnUp?: boolean } = {}): MigrationDefinition<FakeMigrationContext> {
  const migration: Migration<FakeMigrationContext> = {
    async up({ log }) {
      if (options.failOnUp) throw new Error(`${name} exploded`);
      log.push(`up:${name}`);
    },
    async down({ log }) {
      log.push(`down:${name}`);
    },
  };
  return { name, migration };
}

export function fakeSource(definitions: MigrationDefinition<FakeMigrationContext>[]): IMigrationSource<FakeMigrationContext> {
  return { load: async () => definitions };
}
