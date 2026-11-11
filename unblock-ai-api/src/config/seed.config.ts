import { rawEnv } from "./env.config.js";
import { requireString } from "../utils/shared/env-parse.util.js";
import type { SeedConfig } from "../lib/types/config/config.type.js";

export function loadSeedConfig(): SeedConfig {
  return Object.freeze({
    administratorEmail: requireString("SEED_ADMINISTRATOR_EMAIL", rawEnv.SEED_ADMINISTRATOR_EMAIL),
    administratorFullName: requireString("SEED_ADMINISTRATOR_FULL_NAME", rawEnv.SEED_ADMINISTRATOR_FULL_NAME),
  });
}
