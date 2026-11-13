import { rawEnv } from "./env.config.js";
import { parseNumber } from "../utils/shared/env-parse.util.js";
import type { TaskConfig } from "../lib/types/config/config.type.js";

export const task: TaskConfig = Object.freeze({
  maxInformationRequestsPerStep: parseNumber(
    "TASK_MAX_INFORMATION_REQUESTS_PER_STEP",
    rawEnv.TASK_MAX_INFORMATION_REQUESTS_PER_STEP,
    3,
  ),
});
