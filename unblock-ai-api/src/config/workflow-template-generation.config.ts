import { rawEnv } from "./env.config.js";
import { parseNumber } from "../utils/shared/env-parse.util.js";
import type { WorkflowTemplateGenerationConfig } from "../lib/types/config/config.type.js";

export const workflowTemplateGeneration: WorkflowTemplateGenerationConfig = Object.freeze({
  maxAttempts: parseNumber(
    "WORKFLOW_TEMPLATE_GENERATION_MAX_ATTEMPTS",
    rawEnv.WORKFLOW_TEMPLATE_GENERATION_MAX_ATTEMPTS,
    3,
  ),
});
