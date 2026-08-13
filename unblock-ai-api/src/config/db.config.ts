import { rawEnv } from "./env.config.js";
import { optionalString, requireString } from "../utils/shared/env-parse.util.js";
import type { DbConfig } from "../lib/types/config/config.type.js";

export const db: DbConfig = Object.freeze({
  uri: requireString("MONGODB_URI", rawEnv.MONGODB_URI),
  dbName: optionalString("MONGODB_DB", rawEnv.MONGODB_DB, "unblock_ai"),
  serverSelectionTimeoutMs: 5000,
});
