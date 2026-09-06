import { readFile } from "node:fs/promises";
import { TemplateModel } from "../../../src/models/template.model.js";
import { createVectorStore } from "../../../src/services/vector-store/index.vector-store.js";
import { RetrievalService } from "../../../src/services/retrieval.service.js";
import { EmbeddingService } from "../../../src/services/embedding.service.js";
import { selectorChatClient } from "../../../src/services/azure-openai.client.js";
import { buildSelectorMessages, type SelectorTranscriptTurn } from "../../../src/data/prompts/selector.prompt.js";
import { decisionSchema, DECISION_SCHEMA_NAME } from "../../../src/data/schemas/decision.schema.js";
import { supportsTemperatureControl } from "../../../src/data/constants/model.constant.js";
import { config } from "../../../src/config/index.config.js";
import { closeDb } from "../../../src/db/mongo.client.js";
import type { PerfCase, PerfOperation, PerfUsage } from "../../../src/lib/types/perf/perf.type.js";

const CASES_PATH = "src/data/samples/perf/task-request.cases.json";

let retrievalService: RetrievalService;

/**
 * Mirrors `SelectionService.start()` - the first thing that happens when a
 * normal user types what they want: retrieval finds candidate workflows,
 * then the selector model decides matched/ambiguous/no_match. Clarifying
 * follow-up turns (`SelectionService.answer`) are out of scope on purpose;
 * this measures only that first decision.
 *
 * Retrieval runs for real (embeddings + vector search against whatever
 * templates are seeded in the configured DB) because the selector prompt's
 * size, and therefore its token cost, depends on the candidates it returns.
 */
export const taskRequestOperation: PerfOperation = {
  name: "task-request",

  async setup(): Promise<void> {
    const templateModel = new TemplateModel();
    const vectorStore = createVectorStore(config.retrieval.vectorBackend, {
      templateReader: templateModel,
      templateModel,
      indexName: config.retrieval.atlasIndexName,
    });
    retrievalService = new RetrievalService({ vectorStore, embeddingService: new EmbeddingService() });
  },

  async teardown(): Promise<void> {
    await closeDb();
  },

  async loadCases(): Promise<PerfCase[]> {
    const raw = await readFile(CASES_PATH, "utf8");
    return JSON.parse(raw) as PerfCase[];
  },

  async run(testCase: PerfCase): Promise<PerfUsage> {
    const candidates = await retrievalService.retrieve(testCase.input);

    if (candidates.length === 0) {
      // Matches SelectorService.decide: no candidates means no model call is made.
      return { inputTokens: null, outputTokens: null, totalTokens: null, finishReason: null };
    }

    const transcript: SelectorTranscriptTurn[] = [{ role: "user", text: testCase.input }];
    const messages = buildSelectorMessages({ candidates, transcript });
    const deployment = config.azureOpenAI.selectorDeployment;

    const response = await selectorChatClient.chat.completions.create({
      model: deployment,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: { name: DECISION_SCHEMA_NAME, schema: decisionSchema, strict: true },
      },
      ...(supportsTemperatureControl(deployment) ? { temperature: 0 } : {}),
    });

    const choice = response.choices[0];
    JSON.parse(choice?.message.content ?? "{}");

    return {
      inputTokens: response.usage?.prompt_tokens ?? null,
      outputTokens: response.usage?.completion_tokens ?? null,
      totalTokens: response.usage?.total_tokens ?? null,
      finishReason: choice?.finish_reason ?? null,
    };
  },
};
