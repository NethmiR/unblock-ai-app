import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { ExecutionService } from "../../../src/services/execution.service.js";
import { PlannerService } from "../../../src/services/planner.service.js";
import { ValidationError } from "../../../src/errors/validation.error.js";
import { ConflictError } from "../../../src/errors/conflict.error.js";
import { STEP_STATE, TASK_STATUS } from "../../../src/data/constants/status.constant.js";
import { loadExpectedFixture, stepById } from "../../helpers/fixture.helper.js";
import type { TaskDocument, TaskStepState } from "../../../src/lib/types/task/task.type.js";
import type { WorkflowDefinition } from "../../../src/lib/types/workflow/workflow.type.js";

const LEAVE_WORKFLOW = loadExpectedFixture("it_faculty_overseas_leave.json");
const EVENT_WORKFLOW = loadExpectedFixture("departmental_event_workshop.json");

function finalizedTask(workflow: WorkflowDefinition): TaskDocument {
  const planner = new PlannerService();
  const { requirements, steps } = planner.compile(workflow);
  const now = new Date();

  const seeded: TaskStepState[] = steps.map((step) => ({
    ...step,
    state: step.depends_on.length === 0 ? STEP_STATE.READY : STEP_STATE.BLOCKED,
  }));

  return {
    _id: new ObjectId(),
    reference: "REF-0001",
    session_id: "session-1",
    workflow_id: workflow.workflow_id,
    version: 1,
    status: TASK_STATUS.READY,
    requirements,
    values: {},
    steps: seeded,
    audit: [],
    completion_document: null,
    created_at: now,
    updated_at: now,
  };
}

function stateOf(steps: TaskStepState[], stepId: string): string {
  return steps.find((s) => s.step_id === stepId)!.state;
}

test("advance() on a freshly finalized leave task dispatches only advisor_review", () => {
  const task = finalizedTask(LEAVE_WORKFLOW);
  const engine = new ExecutionService();

  const result = engine.advance(task, LEAVE_WORKFLOW);

  assert.deepEqual(result.dispatched, ["advisor_review"]);
  assert.equal(stateOf(result.steps, "advisor_review"), STEP_STATE.PENDING_APPROVAL);
  assert.equal(stateOf(result.steps, "hod_review"), STEP_STATE.BLOCKED);
  assert.equal(stateOf(result.steps, "dean_review"), STEP_STATE.BLOCKED);
  assert.equal(result.completed, false);
  assert.equal(result.terminated, false);
});

test("advisor approves: hod_review dispatches, dean_review stays blocked", () => {
  const task = finalizedTask(LEAVE_WORKFLOW);
  const engine = new ExecutionService();

  const dispatched = engine.advance(task, LEAVE_WORKFLOW);
  const afterApprove = engine.applyDecision(
    { ...task, steps: dispatched.steps },
    LEAVE_WORKFLOW,
    "advisor_review",
    "approved",
    null,
  );

  assert.equal(stateOf(afterApprove.steps, "advisor_review"), STEP_STATE.APPROVED);
  assert.deepEqual(afterApprove.dispatched, ["hod_review"]);
  assert.equal(stateOf(afterApprove.steps, "hod_review"), STEP_STATE.PENDING_APPROVAL);
  assert.equal(stateOf(afterApprove.steps, "dean_review"), STEP_STATE.BLOCKED);
});

test("advisor rejects: task terminates, later steps skip, dispatched is empty", () => {
  const task = finalizedTask(LEAVE_WORKFLOW);
  const engine = new ExecutionService();

  const dispatched = engine.advance(task, LEAVE_WORKFLOW);
  const afterReject = engine.applyDecision(
    { ...task, steps: dispatched.steps },
    LEAVE_WORKFLOW,
    "advisor_review",
    "rejected",
    "Cannot approve leave — exams that week.",
  );

  assert.equal(afterReject.status, TASK_STATUS.REJECTED);
  assert.equal(afterReject.terminated, true);
  assert.deepEqual(afterReject.dispatched, []);
  assert.equal(afterReject.termination_reason, "Cannot approve leave — exams that week.");
  assert.equal(stateOf(afterReject.steps, "advisor_review"), STEP_STATE.REJECTED);
  assert.equal(stateOf(afterReject.steps, "hod_review"), STEP_STATE.SKIPPED);
  assert.equal(stateOf(afterReject.steps, "dean_review"), STEP_STATE.SKIPPED);
});

test("all three approve: task completes", () => {
  const task = finalizedTask(LEAVE_WORKFLOW);
  const engine = new ExecutionService();

  let current = engine.advance(task, LEAVE_WORKFLOW);
  for (const stepId of ["advisor_review", "hod_review", "dean_review"]) {
    const withDispatch = { ...task, steps: current.steps };
    current = engine.applyDecision(withDispatch, LEAVE_WORKFLOW, stepId, "approved", null);
  }

  assert.equal(current.status, TASK_STATUS.COMPLETED);
  assert.equal(current.completed, true);
  assert.equal(stateOf(current.steps, "advisor_review"), STEP_STATE.APPROVED);
  assert.equal(stateOf(current.steps, "hod_review"), STEP_STATE.APPROVED);
  assert.equal(stateOf(current.steps, "dean_review"), STEP_STATE.APPROVED);
});

test("advance() on a finalized event task dispatches two independent steps in one pass", () => {
  const task = finalizedTask(EVENT_WORKFLOW);
  const engine = new ExecutionService();

  const result = engine.advance(task, EVENT_WORKFLOW);

  assert.deepEqual(new Set(result.dispatched), new Set(["hall_booking", "speaker_clearance"]));
  assert.equal(stateOf(result.steps, "refreshments_approval"), STEP_STATE.BLOCKED);
});

test("the gated branch stays blocked until its dependency reports approved", () => {
  const task = finalizedTask(EVENT_WORKFLOW);
  const engine = new ExecutionService();

  const dispatched = engine.advance(task, EVENT_WORKFLOW);
  const afterHallApproved = engine.applyDecision(
    { ...task, steps: dispatched.steps },
    EVENT_WORKFLOW,
    "hall_booking",
    "approved",
    null,
  );

  assert.equal(stateOf(afterHallApproved.steps, "refreshments_approval"), STEP_STATE.PENDING_APPROVAL);
  assert.equal(stateOf(afterHallApproved.steps, "speaker_clearance"), STEP_STATE.PENDING_APPROVAL);
  assert.equal(afterHallApproved.completed, false);
});

test("a step already pending_approval is not re-dispatched", () => {
  const task = finalizedTask(LEAVE_WORKFLOW);
  const engine = new ExecutionService();

  const first = engine.advance(task, LEAVE_WORKFLOW);
  const second = engine.advance({ ...task, steps: first.steps }, LEAVE_WORKFLOW);

  assert.deepEqual(second.dispatched, []);
  assert.equal(stateOf(second.steps, "advisor_review"), STEP_STATE.PENDING_APPROVAL);
});

test("applyDecision on an outcome the step does not declare throws ValidationError", () => {
  const task = finalizedTask(EVENT_WORKFLOW);
  const engine = new ExecutionService();

  const dispatched = engine.advance(task, EVENT_WORKFLOW);

  assert.throws(
    () =>
      engine.applyDecision(
        { ...task, steps: dispatched.steps },
        EVENT_WORKFLOW,
        "hall_booking",
        "request_more_info",
        null,
      ),
    ValidationError,
  );
});

test("dean_review is a real step in the fixture used for these tests", () => {
  assert.ok(stepById(LEAVE_WORKFLOW, "dean_review"));
});

test("request_more_info reopens the step, bumps reopen_count, and clears the token", () => {
  const task = finalizedTask(LEAVE_WORKFLOW);
  const engine = new ExecutionService();

  const dispatched = engine.advance(task, LEAVE_WORKFLOW);
  const withToken = dispatched.steps.map((s) =>
    s.step_id === "advisor_review"
      ? { ...s, approval_token: "tok", token_expires_at: new Date(), token_used_at: null }
      : s,
  );

  const result = engine.applyDecision(
    { ...task, steps: withToken },
    LEAVE_WORKFLOW,
    "advisor_review",
    "request_more_info",
    "Please attach your travel itinerary.",
  );

  const advisorStep = result.steps.find((s) => s.step_id === "advisor_review")!;
  assert.equal(advisorStep.state, STEP_STATE.READY);
  assert.equal(advisorStep.outcome, "request_more_info");
  assert.equal(advisorStep.reason, "Please attach your travel itinerary.");
  assert.equal(advisorStep.reopen_count, 1);
  assert.equal(advisorStep.approval_token, null);
  assert.equal(advisorStep.token_expires_at, null);
  assert.equal(advisorStep.token_used_at, null);
  assert.deepEqual(result.dispatched, []);
});

test("a reopen leaves other steps' prior approvals untouched", () => {
  const task = finalizedTask(LEAVE_WORKFLOW);
  const engine = new ExecutionService();

  const dispatched = engine.advance(task, LEAVE_WORKFLOW);
  const afterApprove = engine.applyDecision(
    { ...task, steps: dispatched.steps },
    LEAVE_WORKFLOW,
    "advisor_review",
    "approved",
    null,
  );

  const afterReopen = engine.applyDecision(
    { ...task, steps: afterApprove.steps },
    LEAVE_WORKFLOW,
    "hod_review",
    "request_more_info",
    "Need the advisor's signed form.",
  );

  assert.equal(stateOf(afterReopen.steps, "advisor_review"), STEP_STATE.APPROVED);
  assert.equal(afterReopen.steps.find((s) => s.step_id === "advisor_review")?.outcome, "approved");
  assert.equal(stateOf(afterReopen.steps, "hod_review"), STEP_STATE.READY);
});

test("a 4th reopen of the same step throws ConflictError", () => {
  const task = finalizedTask(LEAVE_WORKFLOW);
  const engine = new ExecutionService();

  let steps = engine.advance(task, LEAVE_WORKFLOW).steps;
  for (let i = 0; i < 3; i += 1) {
    const result = engine.applyDecision(
      { ...task, steps },
      LEAVE_WORKFLOW,
      "advisor_review",
      "request_more_info",
      `Question ${i + 1}`,
    );
    steps = result.steps;
  }

  assert.equal(steps.find((s) => s.step_id === "advisor_review")?.reopen_count, 3);

  assert.throws(
    () =>
      engine.applyDecision(
        { ...task, steps },
        LEAVE_WORKFLOW,
        "advisor_review",
        "request_more_info",
        "Question 4",
      ),
    ConflictError,
  );
});
