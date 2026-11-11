import { runMigrationCli } from "../../src/db/migration/core/migration.cli.js";
import { createPostgresMigrationEngine } from "../../src/db/migration/postgres/postgres.migration-engine.js";

await runMigrationCli(createPostgresMigrationEngine(), process.argv.slice(2));
