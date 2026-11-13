import test from "node:test";
import assert from "node:assert/strict";
import { TaskEngineService } from "../../../src/services/task-engine.service.js";
import {
  ApprovalChannel,
  ApprovalDecision,
  ENTRY_FORM_STEP_ID,
  TaskEffectKind,
  TaskStatus,
  TaskStepKind,
  TaskStepOrigin,
  TaskStepOutcome,
  TaskStepStatus,
} from "../../../src/data/constants/task.constant.js";
import { ApprovalErrorCode } from "../../../src/data/constants/approval-error.constant.js";
import { withErrorCode } from "../../helpers/error-assertion.helper.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import { buildTaskDocument, EMAIL_ACTOR, directoryResolution, engineContext, leaveResolutions } from "../../helpers/task-fixture.helper.js";
import type { TaskDocument } from "../../../src/lib/types/task/task-document.type.js";
import type { TaskEffect } from "../../../src/lib/types/task/task-engine.type.js";
import type { TaskFieldValue } from "../../../src/lib/types/task/task-value.type.js";
import type { WorkflowDefinition } from "../../../src/lib/types/workflow/workflow.type.js";
import type { WorkflowStep } from "../../../src/lib/types/workflow/step.type.js";

const engine = new TaskEngineService();
const LEAVE = loadExpectedFixture("it_faculty_overseas_leave.json");
const CONTEXT = engineContext(LEAVE);

function entryValues(days: number): Record<string, TaskFieldValue> {
  const returnDay = String(1 + days - 1).padStart(2, "0");
  return {
    "inputs.student_index_number": "IT/2023/017",
    "inputs.destination_country": "Japan",
    "inputs.destination_city": "Tokyo",
    "inputs.departure_date": "2026-12-01",
    "inputs.return_date": days <= 31 ? `2026-12-${returnDay}` : "2027-01-09",
    "inputs.travel_reason": "Research visit",
    "assignees.advisor_review": { user_id: null, name: "Dr Advisor", email: "advisor@u.c" },
  };
}

function withValues(task: TaskDocument, values: Record<string, TaskFieldValue>): TaskDocument {
  return { ...task, values: { ...task.values, ...values } };
}

function step(task: TaskDocument, id: string) {
  const found = task.steps.find((candidate) => candidate.id === id);
  assert.ok(found, id);
  return found;
}

function kinds(effects: readonly TaskEffect[]): string[] {
  return effects.map((effect) => ("step_id" in effect ? `${effect.kind}:${effect.step_id}` : effect.kind));
}

function startedLeave(days = 40): TaskDocument {
  const started = engine.start(buildTaskDocument(LEAVE, leaveResolutions()), CONTEXT).task;
  return engine.submitForm(withValues(started, entryValues(days)), "entry_form__form", CONTEXT).task;
}

test("start activates the entry form without notifying the requester", () => {
  const { task, effects } = engine.start(buildTaskDocument(LEAVE, leaveResolutions()), CONTEXT);

  assert.equal(step(task, ENTRY_FORM_STEP_ID).status, TaskStepStatus.AWAITING_REQUESTER);
  assert.equal(step(task, "advisor_review").status, TaskStepStatus.UPCOMING);
  assert.deepEqual(effects, []);
});

test("submitting the entry form dispatches the advisor and binds the supplied approver", () => {
  const started = engine.start(buildTaskDocument(LEAVE, leaveResolutions()), CONTEXT).task;

  const { task, effects } = engine.submitForm(withValues(started, entryValues(40)), "entry_form__form", CONTEXT);

  assert.equal(step(task, ENTRY_FORM_STEP_ID).outcome, TaskStepOutcome.COMPLETED);
  assert.equal(step(task, "advisor_review").status, TaskStepStatus.AWAITING_APPROVER);
  assert.equal(step(task, "advisor_review").assignee?.email, "advisor@u.c");
  assert.deepEqual(kinds(effects), [`${TaskEffectKind.DISPATCH_APPROVAL}:advisor_review`]);
});

test("the full IT story with one information request completes through the Dean for a 40-day trip", () => {
  let task = startedLeave(40);

  let result = engine.recordDecision(task, "advisor_review", ApprovalDecision.REQUEST_MORE_INFO, "Attach the invitation letter details", EMAIL_ACTOR, CONTEXT);
  task = result.task;
  assert.deepEqual(task.steps.map((entry) => entry.id), [
    ENTRY_FORM_STEP_ID,
    "advisor_review",
    "advisor_review__information_request_1",
    "advisor_review__repeat_1",
    "hod_review",
    "dean_review",
  ]);
  assert.equal(step(task, "advisor_review__information_request_1").status, TaskStepStatus.AWAITING_REQUESTER);
  assert.deepEqual(step(task, "hod_review").depends_on, [{ step_id: "advisor_review__repeat_1", required_outcome: TaskStepOutcome.APPROVED }]);
  assert.deepEqual(kinds(result.effects), [`${TaskEffectKind.NOTIFY_INFORMATION_REQUESTED}:advisor_review__information_request_1`]);

  task = withValues(task, { "responses.advisor_review__information_request_1": "Invited by Tokyo Tech" });
  result = engine.submitForm(task, "advisor_review__information_request_1__form", CONTEXT);
  task = result.task;
  assert.deepEqual(kinds(result.effects), [`${TaskEffectKind.DISPATCH_APPROVAL}:advisor_review__repeat_1`]);
  assert.equal(step(task, "advisor_review__repeat_1").assignee?.email, "advisor@u.c");

  task = engine.recordDecision(task, "advisor_review__repeat_1", ApprovalDecision.APPROVED, null, EMAIL_ACTOR, CONTEXT).task;
  assert.equal(step(task, "hod_review").status, TaskStepStatus.AWAITING_APPROVER);
  task = engine.recordDecision(task, "hod_review", ApprovalDecision.APPROVED, null, EMAIL_ACTOR, CONTEXT).task;
  assert.equal(step(task, "dean_review").status, TaskStepStatus.AWAITING_APPROVER);

  result = engine.recordDecision(task, "dean_review", ApprovalDecision.APPROVED, "Enjoy", EMAIL_ACTOR, CONTEXT);
  assert.equal(result.task.status, TaskStatus.COMPLETED);
  assert.ok(result.task.completed_at);
  assert.deepEqual(kinds(result.effects), [TaskEffectKind.NOTIFY_TASK_COMPLETED]);
  assert.equal(step(result.task, "dean_review").approval?.comment, "Enjoy");
});

test("the Dean step is skipped for a 10-day trip and the task completes after the HoD", () => {
  let task = startedLeave(10);
  task = engine.recordDecision(task, "advisor_review", ApprovalDecision.APPROVED, null, EMAIL_ACTOR, CONTEXT).task;

  const { task: done, effects } = engine.recordDecision(task, "hod_review", ApprovalDecision.APPROVED, null, EMAIL_ACTOR, CONTEXT);

  assert.equal(step(done, "dean_review").status, TaskStepStatus.SKIPPED);
  assert.equal(done.status, TaskStatus.COMPLETED);
  assert.deepEqual(kinds(effects), [TaskEffectKind.NOTIFY_TASK_COMPLETED]);
});

test("a condition on a value that is not submitted yet runs the step", () => {
  const definition: WorkflowDefinition = {
    ...LEAVE,
    steps: LEAVE.steps.map((entry) => (entry.id === "dean_review" ? { ...entry, depends_on: [] } : entry)),
  };
  const context = engineContext(definition);
  const started = engine.start(buildTaskDocument(definition, leaveResolutions()), context).task;

  const { task } = engine.submitForm(withValues(started, { ...entryValues(10), "inputs.return_date": null }), "entry_form__form", context);

  assert.equal(step(task, "dean_review").status, TaskStepStatus.AWAITING_APPROVER);
});

test("a terminating rejection ends the task, cancels the rest and revokes links", () => {
  const task = startedLeave(40);

  const { task: rejected, effects } = engine.recordDecision(task, "advisor_review", ApprovalDecision.REJECTED, "Exams clash", EMAIL_ACTOR, CONTEXT);

  assert.equal(rejected.status, TaskStatus.REJECTED);
  assert.equal(step(rejected, "hod_review").status, TaskStepStatus.CANCELLED);
  assert.equal(step(rejected, "advisor_review").approval?.comment, "Exams clash");
  assert.deepEqual(kinds(effects), [TaskEffectKind.REVOKE_APPROVAL_LINKS, `${TaskEffectKind.NOTIFY_TASK_REJECTED}:advisor_review`]);
});

test("the information request cap removes the option", () => {
  let task = startedLeave(40);
  const context = engineContext(LEAVE, { maxInformationRequestsPerStep: 1 });
  task = engine.recordDecision(task, "advisor_review", ApprovalDecision.REQUEST_MORE_INFO, "Why?", EMAIL_ACTOR, context).task;
  task = engine.submitForm(withValues(task, { "responses.advisor_review__information_request_1": "Because" }), "advisor_review__information_request_1__form", context).task;

  assert.deepEqual(engine.allowedDecisions(task, "advisor_review__repeat_1", context), [ApprovalDecision.APPROVED, ApprovalDecision.REJECTED]);
  assert.throws(
    () => engine.recordDecision(task, "advisor_review__repeat_1", ApprovalDecision.REQUEST_MORE_INFO, "Again?", EMAIL_ACTOR, context),
    withErrorCode(ApprovalErrorCode.APPROVAL_DECISION_NOT_ALLOWED),
  );
});

function approvalStep(id: string, dependsOn: WorkflowStep["depends_on"], overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return { ...LEAVE.steps[1]!, id, name: id, condition: null, depends_on: dependsOn, ...overrides };
}

function definitionWith(steps: WorkflowStep[], requiredSteps: string[] = steps.map((entry) => entry.id)): WorkflowDefinition {
  return { ...LEAVE, computed: [], steps, completion: { ...LEAVE.completion, required_steps: requiredSteps } };
}

function resolutionsFor(definition: WorkflowDefinition) {
  return definition.steps.map((entry) => directoryResolution(entry.id, `${entry.id} holder`, `${entry.id}@u.c`, "Dean"));
}

test("parallel entry steps are dispatched together", () => {
  const definition = definitionWith([approvalStep("hall", []), approvalStep("security", [])]);
  const context = engineContext(definition);
  const started = engine.start(buildTaskDocument(definition, resolutionsFor(definition)), context).task;

  const { effects } = engine.submitForm(withValues(started, entryValues(10)), "entry_form__form", context);

  assert.deepEqual(kinds(effects), [`${TaskEffectKind.DISPATCH_APPROVAL}:hall`, `${TaskEffectKind.DISPATCH_APPROVAL}:security`]);
});

test("a notification step completes immediately", () => {
  const definition = definitionWith([
    approvalStep("hall", []),
    approvalStep("notify_office", [{ step_id: "hall", required_outcome: "approved" }], { type: "notification" }),
  ]);
  const context = engineContext(definition);
  let task = engine.start(buildTaskDocument(definition, resolutionsFor(definition)), context).task;
  task = engine.submitForm(withValues(task, entryValues(10)), "entry_form__form", context).task;

  const { task: done, effects } = engine.recordDecision(task, "hall", ApprovalDecision.APPROVED, null, EMAIL_ACTOR, context);

  assert.equal(step(done, "notify_office").kind, TaskStepKind.NOTIFICATION);
  assert.equal(step(done, "notify_office").status, TaskStepStatus.COMPLETED);
  assert.deepEqual(kinds(effects), [`${TaskEffectKind.SEND_STEP_NOTIFICATION}:notify_office`, TaskEffectKind.NOTIFY_TASK_COMPLETED]);
  assert.equal(done.status, TaskStatus.COMPLETED);
});

test("a non-terminating rejection with no downstream path ends the task as rejected", () => {
  const soft = approvalStep("hall", [], {
    outcomes: { ...LEAVE.steps[1]!.outcomes, rejected: { action: "continue", notify: [], include_reason: true, return_to_step: null, prompt_source: null } },
  });
  const definition = definitionWith([soft, approvalStep("finance", [{ step_id: "hall", required_outcome: "approved" }])]);
  const context = engineContext(definition);
  let task = engine.start(buildTaskDocument(definition, resolutionsFor(definition)), context).task;
  task = engine.submitForm(withValues(task, entryValues(10)), "entry_form__form", context).task;

  const { task: ended, effects } = engine.recordDecision(task, "hall", ApprovalDecision.REJECTED, "Booked", EMAIL_ACTOR, context);

  assert.equal(ended.status, TaskStatus.REJECTED);
  assert.equal(step(ended, "finance").status, TaskStepStatus.CANCELLED);
  assert.deepEqual(kinds(effects), [TaskEffectKind.REVOKE_APPROVAL_LINKS, `${TaskEffectKind.NOTIFY_TASK_REJECTED}:hall`]);
});

test("a later form step activated by a decision notifies the requester", () => {
  const form = approvalStep("travel_documents", [{ step_id: "hall", required_outcome: "approved" }], {
    type: "data_collection",
    assignee: { resolution: "requester", role: null, relative_to: null, directory_query: null, fallback_role: null, display_name: null },
    collects_inputs: ["destination_city"],
  });
  const definition = definitionWith([approvalStep("hall", []), form]);
  const context = engineContext(definition);
  let task = engine.start(buildTaskDocument(definition, resolutionsFor(definition).slice(0, 1)), context).task;
  task = engine.submitForm(withValues(task, entryValues(10)), "entry_form__form", context).task;

  const { task: next, effects } = engine.recordDecision(task, "hall", ApprovalDecision.APPROVED, null, EMAIL_ACTOR, context);

  assert.equal(step(next, "travel_documents").status, TaskStepStatus.AWAITING_REQUESTER);
  assert.deepEqual(kinds(effects), [`${TaskEffectKind.NOTIFY_REQUESTER_ACTION_REQUIRED}:travel_documents`]);
});

test("cancel closes every open step and revokes links", () => {
  const task = startedLeave(40);

  const { task: cancelled, effects } = engine.cancel(task, CONTEXT);

  assert.equal(cancelled.status, TaskStatus.CANCELLED);
  assert.ok(cancelled.steps.filter((entry) => entry.origin !== TaskStepOrigin.ENTRY_FORM).every((entry) => entry.status === TaskStepStatus.CANCELLED));
  assert.deepEqual(kinds(effects), [TaskEffectKind.REVOKE_APPROVAL_LINKS]);
});

test("recordDecision stamps the channel and the deciding user for every decision", () => {
  const actor = { channel: ApprovalChannel.APP, user_id: "user-advisor" };
  for (const decision of [ApprovalDecision.APPROVED, ApprovalDecision.REJECTED, ApprovalDecision.REQUEST_MORE_INFO]) {
    const { task } = engine.recordDecision(startedLeave(40), "advisor_review", decision, "Noted", actor, CONTEXT);
    const approval = step(task, "advisor_review").approval;
    assert.deepEqual([approval?.decision, approval?.decided_via, approval?.decided_by_user_id], [decision, ApprovalChannel.APP, "user-advisor"]);
  }

  const { task } = engine.recordDecision(startedLeave(40), "advisor_review", ApprovalDecision.APPROVED, null, EMAIL_ACTOR, CONTEXT);
  assert.deepEqual([step(task, "advisor_review").approval?.decided_via, step(task, "advisor_review").approval?.decided_by_user_id], [ApprovalChannel.EMAIL_LINK, null]);
});

test("the repeat review does not inherit the first decision's channel or user", () => {
  const actor = { channel: ApprovalChannel.APP, user_id: "user-advisor" };
  const { task } = engine.recordDecision(startedLeave(40), "advisor_review", ApprovalDecision.REQUEST_MORE_INFO, "Why?", actor, CONTEXT);
  const repeat = step(task, "advisor_review__repeat_1").approval;

  assert.deepEqual([repeat?.decision, repeat?.decided_via, repeat?.decided_by_user_id], [null, null, null]);
});
