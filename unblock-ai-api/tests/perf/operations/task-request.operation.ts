import { readFile } from "node:fs/promises";
import { WorkflowTemplateModel } from "../../../src/models/workflow-template.model.js";
import { createVectorStore } from "../../../src/services/vector-store/index.vector-store.js";
import { RetrievalService } from "../../../src/services/retrieval.service.js";
import { EmbeddingService } from "../../../src/services/embedding.service.js";
import { createLlmAdapters } from "../../../src/services/llm-adapter/index.llm-adapter.js";
import { buildSelectorMessages, type SelectorTranscriptTurn } from "../../../src/data/prompts/selector.prompt.js";
import { selectionDecisionResponseSchema } from "../../../src/data/schemas/selection-decision.schema.js";
import { WorkflowTemplateVersionModel } from "../../../src/models/workflow-template-version.model.js";
import { buildOrganisationCatalogue, sampleRequesterProfile } from "../../helpers/organisation-catalogue.helper.js";
import type { SelectorCandidate } from "../../../src/lib/types/selection/candidate.type.js";
import { LlmMessageRole, LlmOperation } from "../../../src/data/constants/llm.constant.js";
import { config } from "../../../src/config/index.config.js";
import { closeDb } from "../../../src/db/mongo.client.js";
import type { PerfCase, PerfOperation, PerfUsage } from "../../../src/lib/types/perf/perf.type.js";

const CASES_PATH = "src/data/samples/perf/task-request.cases.json";

const llmAdapter = createLlmAdapters(config.llm)[LlmOperation.WORKFLOW_SELECTION];
const catalogue = buildOrganisationCatalogue();
const profile = sampleRequesterProfile("Kavindu Jayawardena", catalogue);
const versionModel = new WorkflowTemplateVersionModel();

let retrievalService: RetrievalService;

/**
 * Mirrors `SelectionService.start()` - the first thing that happens when a
 * normal user types what they want: retrieval finds candidate workflow templates,
 * then the selector model decides matched/ambiguous/no_match. Clarifying
 * follow-up turns (`SelectionService.postMessage`) are out of scope on purpose;
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

    const audiences = await versionModel.findAudiences(
      candidates.map((candidate) => ({ workflow_template_id: candidate.workflow_template_id, version: candidate.workflow_template_version })),
    );
    const selectorCandidates: SelectorCandidate[] = candidates.flatMap((candidate) =>
      candidate.retrieval_summary === null
        ? []
        : [
            {
              workflow_template_id: candidate.workflow_template_id,
              title: candidate.title,
              retrieval_summary: candidate.retrieval_summary,
              audience_unit_names: (audiences.get(candidate.workflow_template_id)?.organisationalUnitCodes ?? []).map(
                (code) => catalogue.unitsByCode.get(code)?.name ?? code,
              ),
            },
          ],
    );
    const transcript: SelectorTranscriptTurn[] = [{ role: LlmMessageRole.USER, text: testCase.input }];
    const completion = await llmAdapter.generateCompletion({
      operation: LlmOperation.WORKFLOW_SELECTION,
      messages: buildSelectorMessages({ candidates: selectorCandidates, transcript, facts: profile.facts, matchedCandidate: null }),
      responseSchema: selectionDecisionResponseSchema,
    });

    JSON.parse(completion.content);

    return { ...completion.usage, finishReason: completion.finishReason };
  },
};
