import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "../config/index.config.js";
import { logger } from "../utils/shared/logger.util.js";
import { DatabaseError } from "../errors/database.error.js";

let pool: Pool | null = null;

/** Lazy, like getDb(): the process starts even if Postgres is not up yet. */
export function getPool(): Pool {
  if (pool) return pool;

  pool = new Pool({
    connectionString: config.postgres.url,
    max: config.postgres.poolMax,
    connectionTimeoutMillis: config.postgres.connectionTimeoutMs,
  });
  // node-postgres emits 'error' on idle clients. With no listener, Node treats it
  // as an unhandled 'error' event and terminates the process.
  pool.on("error", (err) => logger.error("postgres pool error", { message: err.message }));

  return pool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  try {
    const result = await getPool().query<T>(text, params);
    return result.rows;
  } catch (err) {
    throw new DatabaseError("Postgres query failed", { cause: err });
  }
}

/** For the few places needing BEGIN/COMMIT (migrations, the login write). */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw new DatabaseError("Postgres transaction failed", { cause: err });
  } finally {
    client.release();
  }
}

export async function checkPostgresHealth(): Promise<boolean> {
  try {
    await getPool().query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
