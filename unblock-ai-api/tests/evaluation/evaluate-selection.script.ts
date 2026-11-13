import { readFile } from "node:fs/promises";
import { InMemoryVectorStore } from "../../src/services/vector-store/in-memory.vector-store.js";
import { RetrievalService } from "../../src/services/retrieval.service.js";
import { EmbeddingService } from "../../src/services/embedding.service.js";
import { SelectorService } from "../../src/services/selector.service.js";
import { createLlmAdapters } from "../../src/services/llm-adapter/index.llm-adapter.js";
import { config } from "../../src/config/index.config.js";
import { LlmMessageRole, LlmOperation } from "../../src/data/constants/llm.constant.js";
import { SelectionDecisionKind } from "../../src/data/constants/selection.constant.js";
import { buildFixtureRetrievalReader } from "../helpers/fixture-retrieval-corpus.helper.js";
import { buildOrganisationCatalogue, sampleRequesterProfile } from "../helpers/organisation-catalogue.helper.js";
import { eligibleFixtureCandidates, type SelectionEvaluationCase } from "../helpers/selection-evaluation.helper.js";

interface EvaluationRow {
  query: string;
  expected: string;
  got: string;
  workflow_template: string;
  recall: string;
  ok: string;
}

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(0)}%`;
}

const cases = JSON.parse(
  await readFile("src/data/samples/selection/queries.json", "utf8"),
) as SelectionEvaluationCase[];

const embeddingService = new EmbeddingService();
const vectorStore = new InMemoryVectorStore({ retrievalReader: await buildFixtureRetrievalReader(embeddingService) });
const retrievalService = new RetrievalService({ vectorStore, embeddingService });
const selectorService = new SelectorService({ llmAdapter: createLlmAdapters(config.llm)[LlmOperation.WORKFLOW_SELECTION] });
const catalogue = buildOrganisationCatalogue();

let recallHits = 0;
let recallTotal = 0;
let decisionHits = 0;
const rows: EvaluationRow[] = [];

for (const c of cases) {
  const candidates = await retrievalService.retrieve(c.query);
  const ids = candidates.map((x) => x.workflow_template_id);

  const expectedIds = c.expect_workflow ? [c.expect_workflow] : (c.expect_in_candidates ?? []);
  let recall = "n/a";
  if (expectedIds.length) {
    recallTotal++;
    const hit = expectedIds.every((id) => ids.includes(id));
    if (hit) recallHits++;
    recall = hit ? "HIT" : "MISS";
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

  rows.push({
    query: c.query.slice(0, 42),
    expected: c.expect,
    got: decision.decision,
    workflow_template: decision.workflow_template_id ?? "-",
    recall,
    ok: correct ? "PASS" : "FAIL",
  });
}

console.table(rows);
console.log(`\nRecall@5          : ${recallHits}/${recallTotal}  (${pct(recallHits, recallTotal)})`);
console.log(`Decision accuracy : ${decisionHits}/${cases.length}  (${pct(decisionHits, cases.length)})`);
console.log(`\nRecall bad  -> fix retrieval_summary / embeddings`);
console.log(`Decision bad -> fix the selector prompt`);
