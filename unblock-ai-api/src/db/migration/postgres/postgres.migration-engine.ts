import { fileURLToPath } from "node:url";
import { createMigrationEngine, type MigrationEngine } from "../core/migration.engine.js";
import { PostgresMigrationStore } from "./postgres.migration-store.js";
import { POSTGRES_MIGRATION_TEMPLATE } from "./postgres.migration-template.js";
import type { PostgresMigrationContext } from "../../../lib/types/migration/migration.type.js";

const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("./migrations", import.meta.url));

export function createPostgresMigrationEngine(): MigrationEngine<PostgresMigrationContext> {
  return createMigrationEngine({
    label: "postgres",
    directory: MIGRATIONS_DIRECTORY,
    template: POSTGRES_MIGRATION_TEMPLATE,
    store: new PostgresMigrationStore(),
  });
}
