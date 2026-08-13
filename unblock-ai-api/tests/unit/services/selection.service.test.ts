import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { SelectionService } from "../../../src/services/selection.service.js";
import { ConflictError } from "../../../src/errors/conflict.error.js";
import { FakeSelectionSessionModel } from "../../helpers/fake-model.helper.js";
import type { RetrievalService } from "../../../src/services/retrieval.service.js";
import type { SelectorService } from "../../../src/services/selector.service.js";
import type { WorkflowService } from "../../../src/services/workflow.service.js";
import type { BoostedCandidate } from "../../../src/lib/types/selection/candidate.type.js";
import type { SelectorDecision } from "../../../src/lib/types/selection/decision.type.js";
import type { SelectorTranscriptTurn } from "../../../src/data/prompts/selector.prompt.js";
import type { WorkflowDefinition } from "../../../src/lib/types/workflow/workflow.type.js";

function candidate(overrides: Partial<BoostedCandidate>): BoostedCandidate {
  return {
    workflow_id: "x",
    version: 1,
    title: "X",
    description: "",
    score: 0,
    aliases_lower: [],
    retrieval_summary: null,
    retrieval_text: "",
    base_score: 0,
    alias_hits: [],
    ...overrides,
  };
}

const CANDIDATES: BoostedCandidate[] = [
  candidate({
    workflow_id: "it_leave",
    version: 1,
    title: "IT Overseas Leave",
    score: 0.81,
    base_score: 0.66,
    alias_hits: ["overseas leave"],
    retrieval_summary: { one_liner: "Travel overseas as an IT undergraduate." } as BoostedCandidate["retrieval_summary"],
  }),
  candidate({
    workflow_id: "eng_leave",
    version: 1,
    title: "Eng Overseas Leave",
    score: 0.79,
    base_score: 0.79,
    alias_hits: [],
    retrieval_summary: {
      one_liner: "Travel overseas as an Engineering undergraduate.",
    } as BoostedCandidate["retrieval_summary"],
  }),
];

interface FakeRetrieverCall {
  query: string;
  options: { institutionType?: string | null };
}

function fakeRetrievalService(candidates: BoostedCandidate[] = CANDIDATES): RetrievalService & { calls: FakeRetrieverCall[] } {
  const calls: FakeRetrieverCall[] = [];
  return {
    calls,
    retrieve(query: string, options: { institutionType?: string | null } = {}) {
      calls.push({ query, options });
      return Promise.resolve(candidates);
    },
  } as unknown as RetrievalService & { calls: FakeRetrieverCall[] };
}

interface FakeAgentCall {
  candidates: BoostedCandidate[];
  transcript: SelectorTranscriptTurn[];
}

function fakeSelectorService(...decisions: SelectorDecision[]): SelectorService & { calls: FakeAgentCall[] } {
  const queue = [...decisions];
  const calls: FakeAgentCall[] = [];
  return {
    calls,
    decide(candidates: BoostedCandidate[], transcript: SelectorTranscriptTurn[]) {
      calls.push({ candidates, transcript });
      const next = queue.shift();
      if (!next) throw new Error("fakeSelectorService ran out of queued decisions");
      return Promise.resolve(next);
    },
  } as unknown as SelectorService & { calls: FakeAgentCall[] };
}

function fakeWorkflowService(documents: Record<string, WorkflowDefinition> = {}): WorkflowService {
  return {
    getDocument(workflowId: string) {
      const doc = documents[workflowId];
      if (!doc) throw new Error(`no fake document for ${workflowId}`);
      return Promise.resolve(doc);
    },
  } as unknown as WorkflowService;
}

const MATCHED: SelectorDecision = {
  decision: "matched",
  workflow_id: "it_leave",
  confidence: "high",
  question: null,
  options: [],
  reasoning: "IT faculty stated",
};

const AMBIGUOUS: SelectorDecision = {
  decision: "ambiguous",
  workflow_id: null,
  confidence: "medium",
  question: "Which faculty are you attached to?",
  options: ["Information Technology", "Engineering"],
  reasoning: "candidates differ only by faculty",
};

const NO_MATCH: SelectorDecision = {
  decision: "no_match",
  workflow_id: null,
  confidence: "high",
  question: null,
  options: [],
  reasoning: "nothing relevant",
};

function build({
  retrievalService,
  selectorService,
  sessionModel,
  workflowService = fakeWorkflowService(),
  maxRounds = 2,
}: {
  retrievalService: RetrievalService;
  selectorService: SelectorService;
  sessionModel: FakeSelectionSessionModel;
  workflowService?: WorkflowService;
  maxRounds?: number;
}): SelectionService {
  return new SelectionService({
    retrievalService,
    selectorService,
    sessionModel: sessionModel as unknown as ConstructorParameters<typeof SelectionService>[0]["sessionModel"],
    workflowService,
    maxRounds,
  });
}

test("matched on round 1 finalizes the session", async () => {
  const retrievalService = fakeRetrievalService();
  const sessionModel = new FakeSelectionSessionModel();
  const service = build({ retrievalService, selectorService: fakeSelectorService(MATCHED), sessionModel });

  const out = await service.start("I want IT overseas leave");

  assert.equal(out.decision, "matched");
  assert.equal(out.workflow_id, "it_leave");

  const stored = await sessionModel.findById(out.session_id);
  assert.equal(stored?.outcome, "matched");
  assert.equal(stored?.selected_workflow_id, "it_leave");
  assert.equal(stored?.rounds.length, 0, "a clean match asks nothing");
});

test("no_match finalizes the session with the no_match outcome", async () => {
  const sessionModel = new FakeSelectionSessionModel();
  const service = build({ retrievalService: fakeRetrievalService(), selectorService: fakeSelectorService(NO_MATCH), sessionModel });

  const out = await service.start("I want to buy a boat");

  assert.equal(out.decision, "no_match");
  assert.equal(out.workflow_id, null);
  assert.equal((await sessionModel.findById(out.session_id))?.outcome, "no_match");
});

test("ambiguous appends a question and leaves the session open", async () => {
  const sessionModel = new FakeSelectionSessionModel();
  const service = build({ retrievalService: fakeRetrievalService(), selectorService: fakeSelectorService(AMBIGUOUS), sessionModel });

  const out = await service.start("I want overseas leave");

  assert.equal(out.decision, "ambiguous");
  assert.equal(out.question, "Which faculty are you attached to?");
  assert.deepEqual(out.options, ["Information Technology", "Engineering"]);

  const stored = await sessionModel.findById(out.session_id);
  assert.equal(stored?.outcome, null, "an open session has no outcome yet");
  assert.equal(stored?.rounds.length, 1);
  assert.equal(stored?.rounds[0]?.answer, null);
});

test("answer() never re-runs retrieval", async () => {
  const retrievalService = fakeRetrievalService();
  const sessionModel = new FakeSelectionSessionModel();
  const service = build({ retrievalService, selectorService: fakeSelectorService(AMBIGUOUS, MATCHED), sessionModel });

  const started = await service.start("I want overseas leave");
  assert.equal(retrievalService.calls.length, 1);

  const out = await service.answer(started.session_id, "Information Technology");

  assert.equal(retrievalService.calls.length, 1, "the candidate set is frozen at round 1");
  assert.equal(out.decision, "matched");
  assert.equal(out.workflow_id, "it_leave");
});

test("answer() replays the full transcript against the frozen candidates", async () => {
  const sessionModel = new FakeSelectionSessionModel();
  const selectorService = fakeSelectorService(AMBIGUOUS, MATCHED);
  const service = build({ retrievalService: fakeRetrievalService(), selectorService, sessionModel });

  const started = await service.start("I want overseas leave");
  await service.answer(started.session_id, "Information Technology");

  const secondCall = selectorService.calls[1];
  assert.deepEqual(secondCall?.transcript, [
    { role: "user", text: "I want overseas leave" },
    { role: "assistant", text: "Which faculty are you attached to?" },
    { role: "user", text: "Information Technology" },
  ]);
  assert.deepEqual(
    secondCall?.candidates.map((c) => c.workflow_id),
    ["it_leave", "eng_leave"],
  );
});

test("two ambiguous rounds produce manual_choice with the candidate titles", async () => {
  const sessionModel = new FakeSelectionSessionModel();
  const service = build({
    retrievalService: fakeRetrievalService(),
    selectorService: fakeSelectorService(AMBIGUOUS, AMBIGUOUS, AMBIGUOUS),
    sessionModel,
    maxRounds: 2,
  });

  const started = await service.start("I want overseas leave");
  const second = await service.answer(started.session_id, "not sure");
  assert.equal(second.decision, "ambiguous", "round 2 is still within budget");

  const third = await service.answer(started.session_id, "still not sure");
  assert.equal(third.decision, "manual_choice");
  assert.deepEqual(third.options, ["IT Overseas Leave", "Eng Overseas Leave"]);

  const stored = await sessionModel.findById(started.session_id);
  assert.equal(stored?.rounds.length, 2, "the cap stops a third question being asked");
});

test("choose() finalizes on a candidate the session actually offered", async () => {
  const sessionModel = new FakeSelectionSessionModel();
  const service = build({ retrievalService: fakeRetrievalService(), selectorService: fakeSelectorService(AMBIGUOUS), sessionModel });

  const started = await service.start("I want overseas leave");
  const out = await service.choose(started.session_id, "eng_leave");

  assert.equal(out.decision, "matched");
  assert.equal(out.workflow_id, "eng_leave");

  const stored = await sessionModel.findById(started.session_id);
  assert.equal(stored?.outcome, "matched");
  assert.equal(stored?.selected_workflow_id, "eng_leave");
});

test("choose() rejects a workflow_id that was never a candidate", async () => {
  const sessionModel = new FakeSelectionSessionModel();
  const service = build({ retrievalService: fakeRetrievalService(), selectorService: fakeSelectorService(AMBIGUOUS), sessionModel });

  const started = await service.start("I want overseas leave");
  await assert.rejects(
    () => service.choose(started.session_id, "law_leave"),
    /was not among this session's candidates/,
  );
});

test("the response never leaks the model's reasoning", async () => {
  const service = build({
    retrievalService: fakeRetrievalService(),
    selectorService: fakeSelectorService(MATCHED),
    sessionModel: new FakeSelectionSessionModel(),
  });

  const out = await service.start("I want IT overseas leave");
  assert.equal("reasoning" in out, false);
  assert.deepEqual(Object.keys(out).sort(), [
    "candidates",
    "confidence",
    "decision",
    "options",
    "question",
    "session_id",
    "workflow_id",
  ]);
});

test("candidates are projected to the client shape with rounded scores", async () => {
  const service = build({
    retrievalService: fakeRetrievalService(),
    selectorService: fakeSelectorService(AMBIGUOUS),
    sessionModel: new FakeSelectionSessionModel(),
  });

  const out = await service.start("I want overseas leave");
  assert.deepEqual(out.candidates, [
    {
      workflow_id: "it_leave",
      title: "IT Overseas Leave",
      one_liner: "Travel overseas as an IT undergraduate.",
      score: 0.81,
    },
    {
      workflow_id: "eng_leave",
      title: "Eng Overseas Leave",
      one_liner: "Travel overseas as an Engineering undergraduate.",
      score: 0.79,
    },
  ]);
});

test("an empty candidate list still creates a session and reports no_match", async () => {
  const sessionModel = new FakeSelectionSessionModel();
  const service = build({
    retrievalService: fakeRetrievalService([]),
    selectorService: fakeSelectorService(NO_MATCH),
    sessionModel,
  });

  const out = await service.start("something nobody has a process for");
  assert.equal(out.decision, "no_match");
  assert.deepEqual(out.candidates, []);
  assert.equal((await sessionModel.findById(out.session_id))?.outcome, "no_match");
});

test("institutionType is passed through to the retriever", async () => {
  const retrievalService = fakeRetrievalService();
  const service = build({
    retrievalService,
    selectorService: fakeSelectorService(MATCHED),
    sessionModel: new FakeSelectionSessionModel(),
  });

  await service.start("IT overseas leave", { institutionType: "university" });
  assert.equal(retrievalService.calls[0]?.options.institutionType, "university");
});

test("getMatchedWorkflow returns a ConflictError before a match exists", async () => {
  const sessionModel = new FakeSelectionSessionModel();
  const service = build({
    retrievalService: fakeRetrievalService(),
    selectorService: fakeSelectorService(AMBIGUOUS),
    sessionModel,
  });

  const started = await service.start("I want overseas leave");
  await assert.rejects(() => service.getMatchedWorkflow(started.session_id), ConflictError);
});

test("getMatchedWorkflow returns the matched workflow document after a match", async () => {
  const sessionModel = new FakeSelectionSessionModel();
  const workflowDoc = { workflow_id: "it_leave", title: "IT Overseas Leave" } as unknown as WorkflowDefinition;
  const service = build({
    retrievalService: fakeRetrievalService(),
    selectorService: fakeSelectorService(MATCHED),
    sessionModel,
    workflowService: fakeWorkflowService({ it_leave: workflowDoc }),
  });

  const started = await service.start("I want IT overseas leave");
  const workflow = await service.getMatchedWorkflow(started.session_id);
  assert.equal(workflow.workflow_id, "it_leave");
});
