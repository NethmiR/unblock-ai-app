import { rawEnv } from "./env.config.js";
import { requireString, parseNumber } from "../utils/shared/env-parse.util.js";
import type { PostgresConfig } from "../lib/types/config/config.type.js";

export const postgres: PostgresConfig = Object.freeze({
  url: requireString("POSTGRES_URL", rawEnv.POSTGRES_URL),
  poolMax: parseNumber("POSTGRES_POOL_MAX", rawEnv.POSTGRES_POOL_MAX, 10),
  connectionTimeoutMs: parseNumber(
    "POSTGRES_CONNECTION_TIMEOUT_MS",
    rawEnv.POSTGRES_CONNECTION_TIMEOUT_MS,
    5000,
  ),
});
