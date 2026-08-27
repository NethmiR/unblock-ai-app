import { runMigrations } from "../src/db/migrate.js";
import { closePool } from "../src/db/postgres.client.js";

const applied = await runMigrations();

if (applied.length === 0) {
  console.log("no pending migrations");
} else {
  for (const filename of applied) {
    console.log(`applied  ${filename}`);
  }
}

await closePool();
