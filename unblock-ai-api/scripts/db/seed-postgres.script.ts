import { runSeedCli } from "../../src/db/seed/core/seed.cli.js";
import { createPostgresSeedEngine } from "../../src/db/seed/postgres/postgres.seed-engine.js";

await runSeedCli(createPostgresSeedEngine(), process.argv.slice(2));
