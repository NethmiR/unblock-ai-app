import test from "node:test";
import assert from "node:assert/strict";
import { SelectorService } from "../../../src/services/selector.service.js";
import { SelectionError } from "../../../src/errors/selection.error.js";
import { LlmFinishReason, LlmMessageRole } from "../../../src/data/constants/llm.constant.js";
import type { ILlmAdapter } from "../../../src/services/llm-adapter/llm-adapter.interface.js";
import type { LlmCompletionRequest } from "../../../src/lib/types/ai/llm.type.js";
import type { BoostedCandidate } from "../../../src/lib/types/selection/candidate.type.js";
import type { SelectorDecision } from "../../../src/lib/types/selection/decision.type.js";

const NO_MATCH_DECISION: SelectorDecision = {
  decision: "no_match",
  workflow_id: null,
  confidence: "high",
  question: null,
  options: [],
  reasoning: "",
};

function fakeLlmAdapter(
  respond: (request: LlmCompletionRequest) => Promise<SelectorDecision>,
): ILlmAdapter {
  return {
    modelName: "fake-model",
    async generateCompletion(request) {
      const decision = await respond(request);
      return {
        content: JSON.stringify(decision),
        usage: { inputTokens: null, outputTokens: null, totalTokens: null },
        finishReason: LlmFinishReason.STOP,
      };
    },
  };
}

function replyingWith(payload: SelectorDecision): ILlmAdapter {
  return fakeLlmAdapter(() => Promise.resolve(payload));
}

function candidate(overrides: Partial<BoostedCandidate>): BoostedCandidate {
  return {
    workflow_id: "x",
    version: 1,
    title: "X",
    description: "",
    score: 0.8,
    aliases_lower: [],
    retrieval_summary: { one_liner: "x" } as BoostedCandidate["retrieval_summary"],
    retrieval_text: "",
    base_score: 0.8,
    alias_hits: [],
    ...overrides,
  };
}

const candidates: BoostedCandidate[] = [
  candidate({ workflow_id: "it_leave", title: "IT Overseas Leave", score: 0.8 }),
  candidate({ workflow_id: "eng_leave", title: "Eng Overseas Leave", score: 0.79 }),
];

test("a hallucinated workflow_id is downgraded to ambiguous", async () => {
  const service = new SelectorService({
    llmAdapter: replyingWith({
      decision: "matched",
      workflow_id: "invented_id",
      confidence: "high",
      question: null,
      options: [],
      reasoning: "",
    }),
  });
  const out = await service.decide(candidates, [{ role: LlmMessageRole.USER, text: "leave" }]);
  assert.equal(out.decision, "ambiguous");
  assert.equal(out.workflow_id, null);
});

test("a low-confidence match is downgraded to ambiguous", async () => {
  const service = new SelectorService({
    llmAdapter: replyingWith({
      decision: "matched",
      workflow_id: "it_leave",
      confidence: "low",
      question: null,
      options: [],
      reasoning: "",
    }),
  });
  const out = await service.decide(candidates, [{ role: LlmMessageRole.USER, text: "leave" }]);
  assert.equal(out.decision, "ambiguous");
  assert.ok(out.options.length > 0, "must offer options when falling back");
});

test("an ambiguous verdict without a question gets one", async () => {
  const service = new SelectorService({
    llmAdapter: replyingWith({
      decision: "ambiguous",
      workflow_id: null,
      confidence: "medium",
      question: null,
      options: [],
      reasoning: "",
    }),
  });
  const out = await service.decide(candidates, [{ role: LlmMessageRole.USER, text: "leave" }]);
  assert.ok(out.question);
});

test("empty candidates short-circuit to no_match without a model call", async () => {
  let called = false;
  const llmAdapter = fakeLlmAdapter(() => {
    called = true;
    throw new Error("should not be called");
  });
  const service = new SelectorService({ llmAdapter });
  const out = await service.decide([], [{ role: LlmMessageRole.USER, text: "anything" }]);
  assert.equal(out.decision, "no_match");
  assert.equal(called, false);
});

test("a valid high-confidence match passes through untouched", async () => {
  const service = new SelectorService({
    llmAdapter: replyingWith({
      decision: "matched",
      workflow_id: "it_leave",
      confidence: "high",
      question: null,
      options: [],
      reasoning: "faculty matched",
    }),
  });
  const out = await service.decide(candidates, [{ role: LlmMessageRole.USER, text: "IT overseas leave" }]);
  assert.equal(out.decision, "matched");
  assert.equal(out.workflow_id, "it_leave");
});

test("a transport failure surfaces as SelectionError", async () => {
  const llmAdapter = fakeLlmAdapter(() => Promise.reject(new Error("503 upstream")));
  const service = new SelectorService({ llmAdapter });
  await assert.rejects(
    () => service.decide(candidates, [{ role: LlmMessageRole.USER, text: "leave" }]),
    (err: unknown) => err instanceof SelectionError && /503 upstream/.test(err.message),
  );
});

test("non-JSON model content surfaces as SelectionError", async () => {
  const llmAdapter: ILlmAdapter = {
    modelName: "fake-model",
    generateCompletion: () =>
      Promise.resolve({
        content: "not json",
        usage: { inputTokens: null, outputTokens: null, totalTokens: null },
        finishReason: LlmFinishReason.STOP,
      }),
  };
  const service = new SelectorService({ llmAdapter });
  await assert.rejects(
    () => service.decide(candidates, [{ role: LlmMessageRole.USER, text: "leave" }]),
    (err: unknown) => err instanceof SelectionError,
  );
});

test("a decision that does not match the decision schema surfaces as SelectionError", async () => {
  const llmAdapter: ILlmAdapter = {
    modelName: "fake-model",
    generateCompletion: () =>
      Promise.resolve({
        content: JSON.stringify({ decision: "matched", workflow_id: "it_leave" }),
        usage: { inputTokens: null, outputTokens: null, totalTokens: null },
        finishReason: LlmFinishReason.STOP,
      }),
  };
  const service = new SelectorService({ llmAdapter });
  await assert.rejects(
    () => service.decide(candidates, [{ role: LlmMessageRole.USER, text: "leave" }]),
    (err: unknown) => err instanceof SelectionError && /decision schema/.test(err.message),
  );
});

test("the request carries the decision response schema and the candidate summaries", async () => {
  let sent: LlmCompletionRequest | null = null;
  const llmAdapter = fakeLlmAdapter((request) => {
    sent = request;
    return Promise.resolve(NO_MATCH_DECISION);
  });
  const service = new SelectorService({ llmAdapter });

  await service.decide(candidates, [{ role: LlmMessageRole.USER, text: "leave" }]);

  const request = sent as unknown as LlmCompletionRequest;
  assert.equal(request.responseSchema?.name, "workflow_selection_decision");
  assert.match(request.messages[1]!.content, /it_leave/);
  assert.match(request.messages[1]!.content, /eng_leave/);
});
