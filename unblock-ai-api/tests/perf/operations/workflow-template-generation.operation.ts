import { readFile } from "node:fs/promises";
import { createLlmAdapters } from "../../../src/services/llm-adapter/index.llm-adapter.js";
import { LlmOperation } from "../../../src/data/constants/llm.constant.js";
import { buildOrganisationCatalogue } from "../../helpers/organisation-catalogue.helper.js";
import { config } from "../../../src/config/index.config.js";
import { workflowResponseSchema } from "../../../src/data/schemas/workflow-schema.data.js";
import { buildWorkflowTemplateGenerationMessages } from "../../../src/utils/workflow/build-workflow-template-generation-messages.util.js";
import type { PerfCase, PerfOperation, PerfUsage } from "../../../src/lib/types/perf/perf.type.js";

const CASES_PATH = "src/data/samples/perf/workflow-template-generation.cases.json";

const llmAdapter = createLlmAdapters(config.llm)[LlmOperation.WORKFLOW_TEMPLATE_GENERATION];
const catalogue = buildOrganisationCatalogue();

export const workflowTemplateGenerationOperation: PerfOperation = {
  name: "workflow-template-generation",

  async loadCases(): Promise<PerfCase[]> {
    const raw = await readFile(CASES_PATH, "utf8");
    return JSON.parse(raw) as PerfCase[];
  },

  async run(testCase: PerfCase): Promise<PerfUsage> {
    const completion = await llmAdapter.generateCompletion({
      operation: LlmOperation.WORKFLOW_TEMPLATE_GENERATION,
      messages: buildWorkflowTemplateGenerationMessages(testCase.input, catalogue),
      responseSchema: workflowResponseSchema,
    });

    JSON.parse(completion.content);

    return { ...completion.usage, finishReason: completion.finishReason };
  },
};
