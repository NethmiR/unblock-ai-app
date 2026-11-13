import test from "node:test";
import assert from "node:assert/strict";
import {
  SelectionDecisionKind,
  SelectionMessageRole,
  SelectionSessionStatus,
  SelectionTraceStep,
} from "../../../src/data/constants/selection.constant.js";
import { SelectionErrorCode } from "../../../src/data/constants/selection-error.constant.js";
import { withErrorCode } from "../../helpers/error-assertion.helper.js";
import {
  createSelectionTestbed,
  ENG_LEAVE_ID,
  IT_LEAVE_ID,
  selectorDecision,
  WORKSHOP_ID,
} from "../../helpers/selection-testbed.helper.js";
import type { AssistantSelectionMessage, SelectionMessage } from "../../../src/lib/types/selection/session.type.js";

const KAVINDU = "Kavindu Jayawardena";
const HASITHA = "Hasitha Dissanayake";

function lastAssistant(messages: readonly SelectionMessage[]): AssistantSelectionMessage {
  const found = [...messages].reverse().find((message): message is AssistantSelectionMessage => message.role === SelectionMessageRole.ASSISTANT);
  assert.ok(found);
  return found;
}

test("zero eligible candidates means no selector call", async () => {
  const bed = await createSelectionTestbed();
  bed.retrieval.results = [IT_LEAVE_ID];

  const view = await bed.service.start(bed.userIdOf(HASITHA), "I want overseas leave");

  const reply = lastAssistant(view.session.messages);
  assert.equal(bed.selector.requests.length, 0);
  assert.equal(reply.decision, SelectionDecisionKind.NO_MATCH);
  assert.ok(reply.trace.some((entry) => entry.step === SelectionTraceStep.SELECTOR_NOT_NEEDED));
  assert.equal(view.session.status, SelectionSessionStatus.NO_MATCH);
});

test("audience exclusions appear in the trace and never reach the selector", async () => {
  const bed = await createSelectionTestbed();

  const view = await bed.service.start(bed.userIdOf(KAVINDU), "I want overseas leave");

  const trace = lastAssistant(view.session.messages).trace;
  assert.deepEqual(trace.map((entry) => entry.step), [
    SelectionTraceStep.PROFILE_READ,
    SelectionTraceStep.CANDIDATES_RETRIEVED,
    SelectionTraceStep.EXCLUDED_BY_AUDIENCE,
    SelectionTraceStep.SELECTOR_CONSULTED,
  ]);
  assert.deepEqual(trace[2]!.workflow_template_titles, ["Engineering Faculty Overseas Leave Approval"]);
  assert.deepEqual(bed.selector.requests[0]!.candidates.map((candidate) => candidate.workflow_template_id), [IT_LEAVE_ID]);
  assert.deepEqual(bed.selector.requests[0]!.candidates[0]!.audience_unit_names, ["Faculty of Information Technology"]);
});

test("requester-type exclusions appear in the trace", async () => {
  const bed = await createSelectionTestbed();
  bed.retrieval.results = [WORKSHOP_ID, IT_LEAVE_ID];

  const view = await bed.service.start(bed.userIdOf(KAVINDU), "book a hall");

  const excluded = lastAssistant(view.session.messages).trace.find((entry) => entry.step === SelectionTraceStep.EXCLUDED_BY_REQUESTER_TYPE);
  assert.equal(excluded?.count, 1);
});

test("a match records the template, matched facts and an overview", async () => {
  const bed = await createSelectionTestbed();
  bed.selector.enqueue(selectorDecision({ matched_fact_ids: ["P2"] }));

  const view = await bed.service.start(bed.userIdOf(KAVINDU), "I want overseas leave");

  const reply = lastAssistant(view.session.messages);
  assert.equal(view.session.status, SelectionSessionStatus.MATCHED);
  assert.equal(view.session.selected_workflow_template_id, IT_LEAVE_ID);
  assert.deepEqual(reply.matched_fact_ids, ["P2"]);
  assert.equal(view.overviews.get(IT_LEAVE_ID)?.title, "IT Faculty Overseas Leave Approval");
  assert.equal(view.session.created_by, bed.userIdOf(KAVINDU));
  assert.ok(view.session.expires_at.getTime() > Date.now());
});

test("a clarification turn reuses the frozen candidates without retrieval", async () => {
  const bed = await createSelectionTestbed();
  bed.selector.enqueue(
    selectorDecision({ decision: SelectionDecisionKind.AMBIGUOUS, workflow_template_id: null, question: "Leave or travel?", options: ["Leave", "Travel"] }),
    selectorDecision(),
  );
  const started = await bed.service.start(bed.userIdOf(KAVINDU), "overseas");
  assert.equal(started.session.rounds_used, 1);
  assert.deepEqual(lastAssistant(started.session.messages).options.map((option) => option.label), ["Leave", "Travel"]);

  const answered = await bed.service.postMessage(String(started.session._id), bed.userIdOf(KAVINDU), "Leave");

  assert.equal(bed.retrieval.queries.length, 1);
  assert.equal(lastAssistant(answered.session.messages).trace[0]!.step, SelectionTraceStep.CANDIDATES_REUSED);
  assert.equal(answered.session.status, SelectionSessionStatus.MATCHED);
  assert.deepEqual(bed.selector.requests[1]!.transcript.map((turn) => turn.text), ["overseas", "Leave or travel?", "Leave"]);
});

test("the round cap falls back to a manual choice without a selector call", async () => {
  const bed = await createSelectionTestbed({ maxRounds: 1 });
  bed.selector.enqueue(selectorDecision({ decision: SelectionDecisionKind.AMBIGUOUS, workflow_template_id: null, question: "Which?", options: [] }));
  const started = await bed.service.start(bed.userIdOf(KAVINDU), "overseas");

  const capped = await bed.service.postMessage(String(started.session._id), bed.userIdOf(KAVINDU), "not sure");

  const reply = lastAssistant(capped.session.messages);
  assert.equal(bed.selector.requests.length, 1);
  assert.equal(reply.decision, SelectionDecisionKind.MANUAL_CHOICE);
  assert.deepEqual(reply.options.map((option) => option.workflow_template_id), [IT_LEAVE_ID]);
  assert.ok(reply.trace.some((entry) => entry.step === SelectionTraceStep.ROUND_LIMIT_REACHED));
});

test("choose accepts only an eligible candidate and records a match without the selector", async () => {
  const bed = await createSelectionTestbed({ maxRounds: 0 });
  const started = await bed.service.start(bed.userIdOf(KAVINDU), "overseas");
  const sessionId = String(started.session._id);

  await assert.rejects(
    bed.service.choose(sessionId, bed.userIdOf(KAVINDU), ENG_LEAVE_ID),
    withErrorCode(SelectionErrorCode.SELECTION_OPTION_NOT_OFFERED),
  );
  const chosen = await bed.service.choose(sessionId, bed.userIdOf(KAVINDU), IT_LEAVE_ID);

  assert.equal(bed.selector.requests.length, 0);
  assert.equal(chosen.session.status, SelectionSessionStatus.MATCHED);
  assert.equal(lastAssistant(chosen.session.messages).decision, SelectionDecisionKind.MATCHED);
});

test("a message after a match reuses candidates and can request the start", async () => {
  const bed = await createSelectionTestbed();
  bed.selector.enqueue(selectorDecision(), selectorDecision({ decision: SelectionDecisionKind.START_REQUESTED }));
  const started = await bed.service.start(bed.userIdOf(KAVINDU), "overseas leave");

  const confirmed = await bed.service.postMessage(String(started.session._id), bed.userIdOf(KAVINDU), "Start the task");

  assert.equal(bed.retrieval.queries.length, 1);
  assert.equal(bed.selector.requests[1]!.matchedWorkflowTemplateId, IT_LEAVE_ID);
  assert.equal(lastAssistant(confirmed.session.messages).decision, SelectionDecisionKind.START_REQUESTED);
  assert.equal(confirmed.session.status, SelectionSessionStatus.MATCHED);
});

test("a message after no match re-retrieves on all requester messages", async () => {
  const bed = await createSelectionTestbed();
  bed.selector.enqueue(selectorDecision({ decision: SelectionDecisionKind.NO_MATCH, workflow_template_id: null }), selectorDecision());
  const started = await bed.service.start(bed.userIdOf(KAVINDU), "travel");

  const rephrased = await bed.service.postMessage(String(started.session._id), bed.userIdOf(KAVINDU), "overseas leave");

  assert.deepEqual(bed.retrieval.queries, ["travel", "travel\noverseas leave"]);
  assert.equal(lastAssistant(rephrased.session.messages).trace[0]!.step, SelectionTraceStep.CANDIDATES_RETRIEVED);
});

test("another requester cannot read or continue the session", async () => {
  const bed = await createSelectionTestbed();
  const started = await bed.service.start(bed.userIdOf(KAVINDU), "overseas leave");
  const sessionId = String(started.session._id);

  await assert.rejects(bed.service.get(sessionId, bed.userIdOf(HASITHA)), withErrorCode(SelectionErrorCode.SELECTION_SESSION_NOT_FOUND));
  await assert.rejects(bed.service.postMessage(sessionId, bed.userIdOf(HASITHA), "hi"), withErrorCode(SelectionErrorCode.SELECTION_SESSION_NOT_FOUND));
  await assert.rejects(bed.service.discard(sessionId, bed.userIdOf(HASITHA)), withErrorCode(SelectionErrorCode.SELECTION_SESSION_NOT_FOUND));
});

test("an expired session is not served", async () => {
  const bed = await createSelectionTestbed();
  const started = await bed.service.start(bed.userIdOf(KAVINDU), "overseas leave");
  bed.sessionModel.now = () => new Date(Date.now() + 25 * 60 * 60 * 1000);

  await assert.rejects(bed.service.get(String(started.session._id), bed.userIdOf(KAVINDU)), withErrorCode(SelectionErrorCode.SELECTION_SESSION_NOT_FOUND));
});

test("consumeMatch returns the conversation and requires a match", async () => {
  const bed = await createSelectionTestbed();
  bed.selector.enqueue(selectorDecision({ decision: SelectionDecisionKind.NO_MATCH, workflow_template_id: null }), selectorDecision());
  const started = await bed.service.start(bed.userIdOf(KAVINDU), "travel");
  const sessionId = String(started.session._id);

  await assert.rejects(bed.service.consumeMatch(sessionId, bed.userIdOf(KAVINDU)), withErrorCode(SelectionErrorCode.SELECTION_SESSION_NOT_MATCHED));
  await bed.service.postMessage(sessionId, bed.userIdOf(KAVINDU), "overseas leave");
  const match = await bed.service.consumeMatch(sessionId, bed.userIdOf(KAVINDU));

  assert.equal(match.workflowTemplateId, IT_LEAVE_ID);
  assert.deepEqual(match.conversation.filter((message) => message.role === SelectionMessageRole.REQUESTER).map((message) => message.text), [
    "travel",
    "overseas leave",
  ]);
});

test("the catalogue lists only eligible published templates", async () => {
  const bed = await createSelectionTestbed();

  const overviews = await bed.service.catalogue(bed.userIdOf(KAVINDU));

  assert.deepEqual(overviews.map((overview) => overview.workflow_template_id), [IT_LEAVE_ID]);
  assert.equal(bed.selector.requests.length, 0);
  assert.equal(bed.retrieval.queries.length, 0);
});

test("the message limit is enforced", async () => {
  const bed = await createSelectionTestbed({ maxRounds: 100 });
  bed.selector.enqueue(...Array.from({ length: 20 }, () => selectorDecision({ decision: SelectionDecisionKind.AMBIGUOUS, workflow_template_id: null, question: "?" })));
  const started = await bed.service.start(bed.userIdOf(KAVINDU), "a");
  const sessionId = String(started.session._id);
  for (let index = 0; index < 9; index++) await bed.service.postMessage(sessionId, bed.userIdOf(KAVINDU), "b");

  await assert.rejects(bed.service.postMessage(sessionId, bed.userIdOf(KAVINDU), "c"), withErrorCode(SelectionErrorCode.SELECTION_SESSION_LIMIT_REACHED));
});
