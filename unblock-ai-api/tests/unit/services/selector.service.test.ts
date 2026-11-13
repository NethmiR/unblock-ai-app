import test from "node:test";
import assert from "node:assert/strict";
import { SelectorService, type SelectorRequest } from "../../../src/services/selector.service.js";
import { SelectionError } from "../../../src/errors/selection.error.js";
import { LlmFinishReason, LlmMessageRole, LlmOperation } from "../../../src/data/constants/llm.constant.js";
import { SelectionDecisionKind } from "../../../src/data/constants/selection.constant.js";
import { SelectionErrorCode } from "../../../src/data/constants/selection-error.constant.js";
import { withErrorCode } from "../../helpers/error-assertion.helper.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import { sampleRequesterProfile } from "../../helpers/organisation-catalogue.helper.js";
import type { ILlmAdapter } from "../../../src/services/llm-adapter/llm-adapter.interface.js";
import type { LlmCompletionRequest } from "../../../src/lib/types/ai/llm.type.js";
import type { SelectorCandidate } from "../../../src/lib/types/selection/candidate.type.js";
import type { SelectorDecision } from "../../../src/lib/types/selection/decision.type.js";

const SUMMARY = loadExpectedFixture("it_faculty_overseas_leave.json").retrieval_summary;
const CANDIDATES: SelectorCandidate[] = [
  { workflow_template_id: "it_leave", title: "IT Overseas Leave", retrieval_summary: SUMMARY, audience_unit_names: ["Faculty of Information Technology"] },
  { workflow_template_id: "eng_leave", title: "Eng Overseas Leave", retrieval_summary: SUMMARY, audience_unit_names: [] },
];
const FACTS = sampleRequesterProfile("Ishara Bandara").facts;

function decision(overrides: Partial<SelectorDecision>): SelectorDecision {
  return {
    decision: SelectionDecisionKind.MATCHED,
    workflow_template_id: "it_leave",
    confidence: "high",
    question: null,
    options: [],
    matched_fact_ids: [],
    reasoning: "",
    ...overrides,
  };
}

function adapter(payload: unknown, requests: LlmCompletionRequest[] = []): ILlmAdapter {
  return {
    modelName: "fake",
    generateCompletion: async (request) => {
      requests.push(request);
      return { content: JSON.stringify(payload), usage: { inputTokens: null, outputTokens: null, totalTokens: null }, finishReason: LlmFinishReason.STOP };
    },
  };
}

function request(overrides: Partial<SelectorRequest> = {}): SelectorRequest {
  return {
    candidates: CANDIDATES,
    transcript: [{ role: LlmMessageRole.USER, text: "I want overseas leave" }],
    facts: FACTS,
    matchedWorkflowTemplateId: null,
    ...overrides,
  };
}

test("the prompt carries the profile facts and candidate audiences, labelled as a selection call", async () => {
  const requests: LlmCompletionRequest[] = [];
  await new SelectorService({ llmAdapter: adapter(decision({}), requests) }).decide(request());

  const userMessage = requests[0]!.messages.at(-1)!.content;
  assert.equal(requests[0]!.operation, LlmOperation.WORKFLOW_SELECTION);
  assert.match(userMessage, /## Requester profile\nP1: Member of Faculty of Information Technology/);
  assert.match(userMessage, /P3: Holds Senior Lecturer \(Grade II\) in Department of Information Technology \(Faculty of Information Technology\)/);
  assert.match(userMessage, /Applies to: Faculty of Information Technology/);
  assert.ok(!userMessage.includes("retrieval score"));
  assert.ok(userMessage.indexOf("## Requester profile") < userMessage.indexOf("## Candidate workflows"));
});

test("a match keeps only the fact ids that were given", async () => {
  const result = await new SelectorService({ llmAdapter: adapter(decision({ matched_fact_ids: ["P1", "P9"] })) }).decide(request());

  assert.deepEqual(result.matched_fact_ids, ["P1"]);
});

test("a hallucinated workflow template id becomes an ambiguous decision", async () => {
  const result = await new SelectorService({ llmAdapter: adapter(decision({ workflow_template_id: "made_up" })) }).decide(request());

  assert.equal(result.decision, SelectionDecisionKind.AMBIGUOUS);
  assert.equal(result.workflow_template_id, null);
  assert.ok(result.question);
});

test("start_requested for the suggested template is kept", async () => {
  const llmAdapter = adapter(decision({ decision: SelectionDecisionKind.START_REQUESTED }));

  const result = await new SelectorService({ llmAdapter }).decide(request({ matchedWorkflowTemplateId: "it_leave" }));

  assert.equal(result.decision, SelectionDecisionKind.START_REQUESTED);
});

test("start_requested for another template is downgraded to matched", async () => {
  const llmAdapter = adapter(decision({ decision: SelectionDecisionKind.START_REQUESTED, workflow_template_id: "eng_leave" }));

  const result = await new SelectorService({ llmAdapter }).decide(request({ matchedWorkflowTemplateId: "it_leave" }));

  assert.equal(result.decision, SelectionDecisionKind.MATCHED);
  assert.equal(result.workflow_template_id, "eng_leave");
});

test("a low-confidence match asks instead", async () => {
  const result = await new SelectorService({ llmAdapter: adapter(decision({ confidence: "low" })) }).decide(request());

  assert.equal(result.decision, SelectionDecisionKind.AMBIGUOUS);
  assert.deepEqual(result.options, ["IT Overseas Leave", "Eng Overseas Leave"]);
});

test("an invalid response shape fails the selection", async () => {
  await assert.rejects(
    new SelectorService({ llmAdapter: adapter({ decision: "maybe" }) }).decide(request()),
    (err: unknown) => err instanceof SelectionError && withErrorCode(SelectionErrorCode.SELECTION_FAILED)(err),
  );
});
