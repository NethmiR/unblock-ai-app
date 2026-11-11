import { rawEnv } from "./env.config.js";
import { requireString, optionalString, parseEnum, parseNumber } from "../utils/shared/env-parse.util.js";
import { REPOSITORY_BACKENDS, RepositoryBackend } from "../data/constants/repository.constant.js";
import type { PostgresConfig } from "../lib/types/config/config.type.js";

const repositoryBackend = parseEnum(
  "POSTGRES_REPOSITORY_BACKEND",
  rawEnv.POSTGRES_REPOSITORY_BACKEND,
  REPOSITORY_BACKENDS,
  RepositoryBackend.POSTGRES,
);

export const postgres: PostgresConfig = Object.freeze({
  url:
    repositoryBackend === RepositoryBackend.POSTGRES
      ? requireString("POSTGRES_URL", rawEnv.POSTGRES_URL)
      : optionalString("POSTGRES_URL", rawEnv.POSTGRES_URL, ""),
  poolMax: parseNumber("POSTGRES_POOL_MAX", rawEnv.POSTGRES_POOL_MAX, 10),
  connectionTimeoutMs: parseNumber(
    "POSTGRES_CONNECTION_TIMEOUT_MS",
    rawEnv.POSTGRES_CONNECTION_TIMEOUT_MS,
    5000,
  ),
  repositoryBackend,
});
