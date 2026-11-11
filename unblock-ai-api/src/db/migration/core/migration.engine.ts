import { MigrationGenerator } from "./migration.generator.js";
import { MigrationLoader } from "./migration.loader.js";
import { MigrationRunner } from "./migration.runner.js";
import type { IMigrationStore } from "../../../lib/types/migration/migration.type.js";

export interface MigrationEngineOptions<TContext> {
  label: string;
  directory: string;
  template: string;
  store: IMigrationStore<TContext>;
}

export interface MigrationEngine<TContext> {
  readonly label: string;
  readonly runner: MigrationRunner<TContext>;
  readonly generator: MigrationGenerator;
  close(): Promise<void>;
}

export function createMigrationEngine<TContext>({
  label,
  directory,
  template,
  store,
}: MigrationEngineOptions<TContext>): MigrationEngine<TContext> {
  return {
    label,
    runner: new MigrationRunner({ store, source: new MigrationLoader<TContext>(directory) }),
    generator: new MigrationGenerator(directory, template),
    close: () => store.close(),
  };
}
