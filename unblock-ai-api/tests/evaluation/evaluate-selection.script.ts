import { readFile } from "node:fs/promises";
import { InMemoryVectorStore } from "../../src/services/vector-store/in-memory.vector-store.js";
import { RetrievalService } from "../../src/services/retrieval.service.js";
import { EmbeddingService } from "../../src/services/embedding.service.js";
import { SelectorService } from "../../src/services/selector.service.js";
import { LlmMessageRole } from "../../src/data/constants/llm.constant.js";
import { buildFixtureRetrievalReader } from "../helpers/fixture-retrieval-corpus.helper.js";

interface EvaluationCase {
  query: string;
  expect: string;
  expect_workflow?: string;
  expect_in_candidates?: string[];
  note?: string;
}

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
) as EvaluationCase[];

const embeddingService = new EmbeddingService();
const vectorStore = new InMemoryVectorStore({ retrievalReader: await buildFixtureRetrievalReader(embeddingService) });
const retrievalService = new RetrievalService({ vectorStore, embeddingService });
const selectorService = new SelectorService();

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

  const decision = await selectorService.decide(candidates, [{ role: LlmMessageRole.USER, text: c.query }]);
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
