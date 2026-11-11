import { runMigrationCli } from "../../src/db/migration/core/migration.cli.js";
import { createMongoMigrationEngine } from "../../src/db/migration/mongo/mongo.migration-engine.js";

await runMigrationCli(createMongoMigrationEngine(), process.argv.slice(2));
