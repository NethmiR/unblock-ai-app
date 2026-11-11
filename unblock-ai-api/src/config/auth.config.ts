import { rawEnv } from "./env.config.js";
import { parseNumber } from "../utils/shared/env-parse.util.js";
import type { AuthConfig } from "../lib/types/config/config.type.js";

export const auth: AuthConfig = Object.freeze({
  sessionTtlHours: parseNumber("SESSION_TTL_HOURS", rawEnv.SESSION_TTL_HOURS, 12),
  maxFailedAttempts: parseNumber("AUTH_MAX_FAILED_ATTEMPTS", rawEnv.AUTH_MAX_FAILED_ATTEMPTS, 0),
  lockoutDurationMinutes: parseNumber("AUTH_LOCKOUT_DURATION_MINUTES", rawEnv.AUTH_LOCKOUT_DURATION_MINUTES, 15),
});
