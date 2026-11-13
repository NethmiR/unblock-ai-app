import { rawEnv } from "./env.config.js";
import { parseNumber } from "../utils/shared/env-parse.util.js";
import type { SelectionConfig } from "../lib/types/config/config.type.js";

export const selection: SelectionConfig = Object.freeze({
  sessionTtlHours: parseNumber("SELECTION_SESSION_TTL_HOURS", rawEnv.SELECTION_SESSION_TTL_HOURS, 24),
  maxRounds: parseNumber("SELECTION_MAX_ROUNDS", rawEnv.SELECTION_MAX_ROUNDS, 2),
});
