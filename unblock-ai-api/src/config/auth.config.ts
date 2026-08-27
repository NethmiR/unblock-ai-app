import { randomBytes } from "node:crypto";
import { rawEnv } from "./env.config.js";
import { requireString, optionalString, parseEnum, parseNumber } from "../utils/shared/env-parse.util.js";
import { ConfigurationError } from "../errors/configuration.error.js";
import type { AuthConfig } from "../lib/types/config/config.type.js";

const BACKENDS = ["postgres", "memory"] as const;

function sessionTokenSecret(): string {
  if (rawEnv.NODE_ENV === "production") {
    return requireString("SESSION_TOKEN_SECRET", rawEnv.SESSION_TOKEN_SECRET);
  }
  // Dev/test: a random per-process secret is fine - a restart invalidating
  // sessions beats ever shipping a default secret into a config file.
  return optionalString("SESSION_TOKEN_SECRET", rawEnv.SESSION_TOKEN_SECRET, randomBytes(32).toString("hex"));
}

export const auth: AuthConfig = Object.freeze({
  sessionTokenSecret: sessionTokenSecret(),
  sessionTtlHours: parseNumber("SESSION_TTL_HOURS", rawEnv.SESSION_TTL_HOURS, 12),
  maxFailedAttempts: parseNumber("AUTH_MAX_FAILED_ATTEMPTS", rawEnv.AUTH_MAX_FAILED_ATTEMPTS, 0),
  storeBackend: parseEnum("AUTH_STORE_BACKEND", rawEnv.AUTH_STORE_BACKEND, BACKENDS, "postgres"),
});

if (auth.sessionTokenSecret !== "" && auth.sessionTokenSecret === rawEnv.APPROVAL_TOKEN_SECRET) {
  throw new ConfigurationError("SESSION_TOKEN_SECRET must differ from APPROVAL_TOKEN_SECRET");
}
