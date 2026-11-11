import { rawEnv } from "./env.config.js";
import { parseNumber } from "../utils/shared/env-parse.util.js";
import type { ExtractionConfig } from "../lib/types/config/config.type.js";

export const extraction: ExtractionConfig = Object.freeze({
  maxAttempts: parseNumber("EXTRACTION_MAX_ATTEMPTS", rawEnv.EXTRACTION_MAX_ATTEMPTS, 3),
});
