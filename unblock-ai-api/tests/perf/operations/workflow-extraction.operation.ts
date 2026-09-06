import { readFile } from "node:fs/promises";
import { chatClient } from "../../../src/services/azure-openai.client.js";
import { config } from "../../../src/config/index.config.js";
import { strictWorkflowSchema } from "../../../src/data/schemas/workflow-schema.data.js";
import { supportsTemperatureControl } from "../../../src/data/constants/model.constant.js";
import { buildExtractionMessages } from "../../../src/utils/workflow/build-extraction-messages.util.js";
import type { PerfCase, PerfOperation, PerfUsage } from "../../../src/lib/types/perf/perf.type.js";

const CASES_PATH = "src/data/samples/perf/workflow-extraction.cases.json";

/**
 * Exercises the same single-call shape as `ExtractionService`'s first attempt
 * (identical messages, schema, and response_format) so measured tokens/latency
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
    const deployment = config.azureOpenAI.deployment;
    const messages = buildExtractionMessages(testCase.input);

    const response = await chatClient.chat.completions.create({
      model: deployment,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: { name: "workflow_definition", schema: strictWorkflowSchema, strict: true },
      },
      ...(supportsTemperatureControl(deployment) ? { temperature: 0 } : {}),
    });

    const choice = response.choices[0];
    JSON.parse(choice?.message.content ?? "");

    return {
      inputTokens: response.usage?.prompt_tokens ?? null,
      outputTokens: response.usage?.completion_tokens ?? null,
      totalTokens: response.usage?.total_tokens ?? null,
      finishReason: choice?.finish_reason ?? null,
    };
  },
};
