import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, withTransaction } from "./postgres.client.js";
import { logger } from "../utils/shared/logger.util.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

async function ensureMigrationsTable(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename   TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
}

/**
 * Applies every *.sql file in db/migrations, in filename order, that is not yet
 * recorded in schema_migrations. Each file runs inside its own transaction, so a
 * half-applied migration is impossible.
 */
export async function runMigrations(): Promise<string[]> {
  await ensureMigrationsTable();

  const applied = new Set(
    (await query<{ filename: string }>("SELECT filename FROM schema_migrations")).map(
      (row) => row.filename,
    ),
  );

  const pending = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => !applied.has(name));

  const appliedNow: string[] = [];
  for (const filename of pending) {
    const sql = readFileSync(path.join(migrationsDir, filename), "utf-8");
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
    });
    logger.info("postgres migration applied", { filename });
    appliedNow.push(filename);
  }

  return appliedNow;
}
