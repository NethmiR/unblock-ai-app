import { rawEnv } from "./env.config.js";
import { requireString, optionalString, parseNumber } from "../utils/shared/env-parse.util.js";
import type { PostgresConfig } from "../lib/types/config/config.type.js";

// Mirrors AUTH_STORE_BACKEND's own default in auth.config.ts. Read from rawEnv
// directly (rather than importing auth.config.ts) to avoid coupling load order
// between the two config modules.
const authStoreBackend = rawEnv.AUTH_STORE_BACKEND || "postgres";

export const postgres: PostgresConfig = Object.freeze({
  // POSTGRES_URL is only mandatory when the auth store actually talks to
  // Postgres - AUTH_STORE_BACKEND=memory (e.g. tests, offline dev) must never
  // need a database, matching getDb()'s own lazy-connect behaviour.
  url:
    authStoreBackend === "postgres"
      ? requireString("POSTGRES_URL", rawEnv.POSTGRES_URL)
      : optionalString("POSTGRES_URL", rawEnv.POSTGRES_URL, ""),
  poolMax: parseNumber("POSTGRES_POOL_MAX", rawEnv.POSTGRES_POOL_MAX, 10),
  connectionTimeoutMs: parseNumber(
    "POSTGRES_CONNECTION_TIMEOUT_MS",
    rawEnv.POSTGRES_CONNECTION_TIMEOUT_MS,
    5000,
  ),
});
