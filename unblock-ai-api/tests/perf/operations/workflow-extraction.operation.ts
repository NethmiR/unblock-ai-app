import { readFile } from "node:fs/promises";
import { createLlmAdapter } from "../../../src/services/llm-adapter/index.llm-adapter.js";
import { config } from "../../../src/config/index.config.js";
import { workflowResponseSchema } from "../../../src/data/schemas/workflow-schema.data.js";
import { buildExtractionMessages } from "../../../src/utils/workflow/build-extraction-messages.util.js";
import type { PerfCase, PerfOperation, PerfUsage } from "../../../src/lib/types/perf/perf.type.js";

const CASES_PATH = "src/data/samples/perf/workflow-extraction.cases.json";

const llmAdapter = createLlmAdapter(config.llm);

/**
 * Exercises the same single-call shape as `ExtractionService`'s first attempt
 * (identical messages and response schema) so measured tokens/latency
 * reflect the real extraction request. Validation-repair retries are excluded
 * on purpose — this measures the primary request, not the retry tail.
 */
export const workflowExtractionOperation: PerfOperation = {
  name: "workflow-extraction",

  async loadCases(): Promise<PerfCase[]> {
    const raw = await readFile(CASES_PATH, "utf8");
    return JSON.parse(raw) as PerfCase[];
  },

  async run(testCase: PerfCase): Promise<PerfUsage> {
    const completion = await llmAdapter.generateCompletion({
      messages: buildExtractionMessages(testCase.input),
      responseSchema: workflowResponseSchema,
    });

    JSON.parse(completion.content);

    return { ...completion.usage, finishReason: completion.finishReason };
  },
};
