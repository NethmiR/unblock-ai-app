import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { InMemoryVectorStore } from "../../src/services/vector-store/in-memory.vector-store.js";
import { RetrievalService } from "../../src/services/retrieval.service.js";
import { SelectorService } from "../../src/services/selector.service.js";
import { LlmMessageRole, LlmOperation } from "../../src/data/constants/llm.constant.js";
import { SelectionDecisionKind } from "../../src/data/constants/selection.constant.js";
import { EmbeddingService } from "../../src/services/embedding.service.js";
import { createLlmAdapters } from "../../src/services/llm-adapter/index.llm-adapter.js";
import { config } from "../../src/config/index.config.js";
import { buildFixtureRetrievalReader } from "../helpers/fixture-retrieval-corpus.helper.js";
import { buildOrganisationCatalogue, sampleRequesterProfile } from "../helpers/organisation-catalogue.helper.js";
import { eligibleFixtureCandidates, type SelectionEvaluationCase } from "../helpers/selection-evaluation.helper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUERIES_PATH = path.join(__dirname, "..", "..", "src", "data", "samples", "selection", "queries.json");

const RECALL_TARGET = 0.9;
const DECISION_TARGET = 0.8;

test("selection quality meets Recall@5 and decision-accuracy targets", async (t) => {
  const cases = JSON.parse(await readFile(QUERIES_PATH, "utf8")) as SelectionEvaluationCase[];
  const embeddingService = new EmbeddingService();
  const vectorStore = new InMemoryVectorStore({ retrievalReader: await buildFixtureRetrievalReader(embeddingService) });
  const retrievalService = new RetrievalService({ vectorStore, embeddingService });
  const selectorService = new SelectorService({ llmAdapter: createLlmAdapters(config.llm)[LlmOperation.WORKFLOW_SELECTION] });
  const catalogue = buildOrganisationCatalogue();

  let recallHits = 0;
  let recallTotal = 0;
  let decisionHits = 0;
  const noMatchFailures: Array<{ query: string; got: string }> = [];

  for (const c of cases) {
    const candidates = await retrievalService.retrieve(c.query);
    const ids = candidates.map((x) => x.workflow_template_id);

    const expectedIds = c.expect_workflow ? [c.expect_workflow] : (c.expect_in_candidates ?? []);
    if (expectedIds.length) {
      recallTotal++;
      if (expectedIds.every((id) => ids.includes(id))) recallHits++;
    }

    const profile = sampleRequesterProfile(c.requester, catalogue);
    const eligible = eligibleFixtureCandidates(candidates, profile, catalogue);
    const decision =
      eligible.length === 0
        ? { decision: SelectionDecisionKind.NO_MATCH, workflow_template_id: null }
        : await selectorService.decide({
            candidates: eligible,
            transcript: [{ role: LlmMessageRole.USER, text: c.query }],
            facts: profile.facts,
            matchedWorkflowTemplateId: null,
          });
    const correct =
      decision.decision === c.expect && (!c.expect_workflow || decision.workflow_template_id === c.expect_workflow);
    if (correct) decisionHits++;

    if (c.expect === "no_match" && decision.decision !== "no_match") {
      noMatchFailures.push({ query: c.query, got: decision.decision });
    }
  }

  await t.test("Recall@5 meets target", () => {
    const recall = recallTotal === 0 ? 1 : recallHits / recallTotal;
    assert.ok(
      recall >= RECALL_TARGET,
      `Recall@5 was ${(recall * 100).toFixed(0)}% (${recallHits}/${recallTotal}), need >= ${RECALL_TARGET * 100}%`,
    );
  });

  await t.test("decision accuracy meets target", () => {
    const accuracy = decisionHits / cases.length;
    assert.ok(
      accuracy >= DECISION_TARGET,
      `Decision accuracy was ${(accuracy * 100).toFixed(0)}% (${decisionHits}/${cases.length}), need >= ${DECISION_TARGET * 100}%`,
    );
  });

  await t.test("every no_match case is correctly refused", () => {
    assert.deepEqual(noMatchFailures, [], `no_match cases must never be answered: ${JSON.stringify(noMatchFailures)}`);
  });
});
