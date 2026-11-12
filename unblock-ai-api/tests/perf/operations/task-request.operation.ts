import { readFile } from "node:fs/promises";
import { WorkflowTemplateModel } from "../../../src/models/workflow-template.model.js";
import { createVectorStore } from "../../../src/services/vector-store/index.vector-store.js";
import { RetrievalService } from "../../../src/services/retrieval.service.js";
import { EmbeddingService } from "../../../src/services/embedding.service.js";
import { createLlmAdapter } from "../../../src/services/llm-adapter/index.llm-adapter.js";
import { buildSelectorMessages, type SelectorTranscriptTurn } from "../../../src/data/prompts/selector.prompt.js";
import { decisionResponseSchema } from "../../../src/data/schemas/decision.schema.js";
import { LlmMessageRole } from "../../../src/data/constants/llm.constant.js";
import { config } from "../../../src/config/index.config.js";
import { closeDb } from "../../../src/db/mongo.client.js";
import type { PerfCase, PerfOperation, PerfUsage } from "../../../src/lib/types/perf/perf.type.js";

const CASES_PATH = "src/data/samples/perf/task-request.cases.json";

const llmAdapter = createLlmAdapter(config.llm);

let retrievalService: RetrievalService;

/**
 * Mirrors `SelectionService.start()` - the first thing that happens when a
 * normal user types what they want: retrieval finds candidate workflow templates,
 * then the selector model decides matched/ambiguous/no_match. Clarifying
 * follow-up turns (`SelectionService.answer`) are out of scope on purpose;
 * this measures only that first decision.
 *
 * Retrieval runs for real (embeddings + vector search against whatever
 * templates are published in the configured DB) because the selector prompt's
 * size, and therefore its token cost, depends on the candidates it returns.
 */
export const taskRequestOperation: PerfOperation = {
  name: "task-request",

  async setup(): Promise<void> {
    const vectorStore = createVectorStore(config.retrieval.vectorBackend, {
      workflowTemplateModel: new WorkflowTemplateModel(),
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

    const transcript: SelectorTranscriptTurn[] = [{ role: LlmMessageRole.USER, text: testCase.input }];
    const completion = await llmAdapter.generateCompletion({
      messages: buildSelectorMessages({ candidates, transcript }),
      responseSchema: decisionResponseSchema,
    });

    JSON.parse(completion.content);

    return { ...completion.usage, finishReason: completion.finishReason };
  },
};
