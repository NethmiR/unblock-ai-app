import { readFile } from "node:fs/promises";
import { createLlmAdapter } from "../../../src/services/llm-adapter/index.llm-adapter.js";
import { config } from "../../../src/config/index.config.js";
import { workflowResponseSchema } from "../../../src/data/schemas/workflow-schema.data.js";
import { buildWorkflowTemplateGenerationMessages } from "../../../src/utils/workflow/build-workflow-template-generation-messages.util.js";
import type { PerfCase, PerfOperation, PerfUsage } from "../../../src/lib/types/perf/perf.type.js";

const CASES_PATH = "src/data/samples/perf/workflow-template-generation.cases.json";

const llmAdapter = createLlmAdapter(config.llm);

export const workflowTemplateGenerationOperation: PerfOperation = {
  name: "workflow-template-generation",

  async loadCases(): Promise<PerfCase[]> {
    const raw = await readFile(CASES_PATH, "utf8");
    return JSON.parse(raw) as PerfCase[];
  },

  async run(testCase: PerfCase): Promise<PerfUsage> {
    const completion = await llmAdapter.generateCompletion({
      messages: buildWorkflowTemplateGenerationMessages(testCase.input),
      responseSchema: workflowResponseSchema,
    });

    JSON.parse(completion.content);

    return { ...completion.usage, finishReason: completion.finishReason };
  },
};
