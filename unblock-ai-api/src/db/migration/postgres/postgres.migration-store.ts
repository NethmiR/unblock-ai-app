import { closePool, query, withTransaction } from "../../postgres.client.js";
import { postgres as postgresConfig } from "../../../config/postgres.config.js";
import { MIGRATION_TRACKING } from "../../../data/constants/migration.constant.js";
import { ConfigurationError } from "../../../errors/configuration.error.js";
import { MigrationError } from "../../../errors/migration.error.js";
import type {
  AppliedMigration,
  IMigrationStore,
  MigrationDefinition,
  PostgresMigrationContext,
} from "../../../lib/types/migration/migration.type.js";

const { STORE: TABLE, LOCK: LOCK_TABLE, LOCK_KEY } = MIGRATION_TRACKING;

interface MigrationRow {
  name: string;
  batch: number;
  applied_at: Date;
}

export class PostgresMigrationStore implements IMigrationStore<PostgresMigrationContext> {
  async initialize(): Promise<void> {
    if (!postgresConfig.url) {
      throw new ConfigurationError("POSTGRES_URL is required to run Postgres migrations");
    }

    await query(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (
         name       TEXT        PRIMARY KEY,
         batch      INTEGER     NOT NULL,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    await query(
      `CREATE TABLE IF NOT EXISTS ${LOCK_TABLE} (
         id        SMALLINT    PRIMARY KEY CHECK (id = ${LOCK_KEY}),
         is_locked BOOLEAN     NOT NULL DEFAULT FALSE,
         locked_at TIMESTAMPTZ
       )`,
    );
    await query(`INSERT INTO ${LOCK_TABLE} (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [LOCK_KEY]);
  }

  async acquireLock(): Promise<void> {
    const rows = await query<{ id: number }>(
      `UPDATE ${LOCK_TABLE} SET is_locked = TRUE, locked_at = now()
        WHERE id = $1 AND is_locked = FALSE
        RETURNING id`,
      [LOCK_KEY],
    );
    if (rows.length === 0) {
      throw new MigrationError(
        "Postgres migrations are locked by another run; use the unlock command if no run is active",
      );
    }
  }

  async releaseLock(): Promise<void> {
    await query(`UPDATE ${LOCK_TABLE} SET is_locked = FALSE, locked_at = NULL WHERE id = $1`, [LOCK_KEY]);
  }

  async listApplied(): Promise<AppliedMigration[]> {
    const rows = await query<MigrationRow>(`SELECT name, batch, applied_at FROM ${TABLE} ORDER BY batch, name`);
    return rows.map(({ name, batch, applied_at }) => ({ name, batch, appliedAt: applied_at }));
  }

  async apply({ name, migration }: MigrationDefinition<PostgresMigrationContext>, batch: number): Promise<void> {
    await withTransaction(async (client) => {
      await migration.up({ client });
      await client.query(`INSERT INTO ${TABLE} (name, batch) VALUES ($1, $2)`, [name, batch]);
    });
  }

  async revert({ name, migration }: MigrationDefinition<PostgresMigrationContext>): Promise<void> {
    await withTransaction(async (client) => {
      await migration.down({ client });
      await client.query(`DELETE FROM ${TABLE} WHERE name = $1`, [name]);
    });
  }

  close(): Promise<void> {
    return closePool();
  }
}
