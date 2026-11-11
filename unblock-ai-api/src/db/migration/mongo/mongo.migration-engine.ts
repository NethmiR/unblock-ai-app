import { fileURLToPath } from "node:url";
import { createMigrationEngine, type MigrationEngine } from "../core/migration.engine.js";
import { MongoMigrationStore } from "./mongo.migration-store.js";
import { MONGO_MIGRATION_TEMPLATE } from "./mongo.migration-template.js";
import type { MongoMigrationContext } from "../../../lib/types/migration/migration.type.js";

const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("./migrations", import.meta.url));

export function createMongoMigrationEngine(): MigrationEngine<MongoMigrationContext> {
  return createMigrationEngine({
    label: "mongo",
    directory: MIGRATIONS_DIRECTORY,
    template: MONGO_MIGRATION_TEMPLATE,
    store: new MongoMigrationStore(),
  });
}
