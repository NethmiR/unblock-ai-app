import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { ApprovalAssignmentState } from "../../../src/data/constants/approval.constant.js";
import { ApprovalChannel, ApprovalDecision, TaskStatus } from "../../../src/data/constants/task.constant.js";
import { TaskEngineService } from "../../../src/services/task-engine.service.js";
import { ApproverAssignmentService } from "../../../src/services/approver-assignment.service.js";
import { approverIdentityOf } from "../../../src/utils/approval/approver-identity.util.js";
import { startInMemoryMongo, stopInMemoryMongo } from "../../helpers/in-memory-mongo.helper.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import { buildTaskDocument, engineContext, leaveResolutions, TASK_NOW } from "../../helpers/task-fixture.helper.js";
import type { ApprovalAssignmentFilter, ApprovalActor } from "../../../src/lib/types/approval/approval.type.js";
import type { TaskDocument } from "../../../src/lib/types/task/task-document.type.js";
import type { TaskModel } from "../../../src/models/task.model.js";

type MongoClientModule = typeof import("../../../src/db/mongo.client.js");

const LEAVE = loadExpectedFixture("it_faculty_overseas_leave.json");
const engine = new TaskEngineService();
const ADVISOR = approverIdentityOf({ id: "user-advisor", email: "Advisor@U.C" });
const HOD = approverIdentityOf({ id: "user-u19@u.c", email: "unrelated@u.c" });
const APP_ADVISOR: ApprovalActor = { channel: ApprovalChannel.APP, user_id: ADVISOR.userId };

let mongo: MongoClientModule;
let service: ApproverAssignmentService;
let taskModel: TaskModel;
let sequence = 0;

before(async () => {
  await startInMemoryMongo();
  mongo = await import("../../../src/db/mongo.client.js");
  taskModel = new (await import("../../../src/models/task.model.js")).TaskModel();
  service = new ApproverAssignmentService({ taskModel });
  for (const task of [waiting, approved, repeated, own, cancelled]) await taskModel.insert(task);
});

after(async () => {
  await mongo.closeDb();
  await stopInMemoryMongo();
});

function at(minutes: number): ReturnType<typeof engineContext> {
  return engineContext(LEAVE, { now: new Date(TASK_NOW.getTime() + minutes * 60_000) });
}

function submittedLeave(minutes: number, overrides: Partial<TaskDocument> = {}): TaskDocument {
  sequence += 1;
  const started = engine.start({ ...buildTaskDocument(LEAVE, leaveResolutions()), reference: `TASK-2026-${String(sequence).padStart(5, "0")}`, ...overrides }, at(minutes)).task;
  const filled: TaskDocument = {
    ...started,
    values: {
      ...started.values,
      "inputs.student_index_number": "IT/2023/017",
      "inputs.destination_country": "Japan",
      "inputs.destination_city": "Tokyo",
      "inputs.departure_date": "2026-12-01",
      "inputs.return_date": "2027-01-09",
      "inputs.travel_reason": "Research visit",
      "assignees.advisor_review": { user_id: null, name: "Dr Advisor", email: "advisor@u.c" },
    },
  };
  return engine.submitForm(filled, "entry_form__form", at(minutes)).task;
}

function decide(task: TaskDocument, stepId: string, decision: ApprovalDecision, minutes: number, comment: string | null = "Noted"): TaskDocument {
  return engine.recordDecision(task, stepId, decision, comment, APP_ADVISOR, at(minutes)).task;
}

function filter(state: ApprovalAssignmentState, overrides: Partial<ApprovalAssignmentFilter> = {}): ApprovalAssignmentFilter {
  return { state, decision: null, search: null, limit: 20, offset: 0, ...overrides };
}

const waiting = submittedLeave(10, { title: "Waiting overseas leave" });
const approved = decide(submittedLeave(1), "advisor_review", ApprovalDecision.APPROVED, 20);
const repeated = (() => {
  let task = decide(submittedLeave(2, { requester: { ...submittedLeave(0).requester, full_name: "Hasitha Dissanayake" } }), "advisor_review", ApprovalDecision.REQUEST_MORE_INFO, 30);
  task = { ...task, values: { ...task.values, "responses.advisor_review__information_request_1": "Tokyo Tech" } };
  task = engine.submitForm(task, "advisor_review__information_request_1__form", at(40)).task;
  return decide(task, "advisor_review__repeat_1", ApprovalDecision.APPROVED, 50, null);
})();
const own = submittedLeave(5, { created_by: ADVISOR.userId });
const cancelled = engine.cancel(submittedLeave(6), at(60)).task;

test("pending lists only live steps assigned to the identity, oldest first, and excludes own and cancelled tasks", async () => {
  const page = await service.list(ADVISOR, filter(ApprovalAssignmentState.PENDING));

  assert.deepEqual(page.rows.map((row) => [row.task.reference, row.step.id]), [[waiting.reference, "advisor_review"]]);
  assert.equal(page.total, 1);
  assert.equal(await service.pendingCount(ADVISOR), 1);
});

test("a task awaiting someone else with a decided step for the identity is not pending for it", async () => {
  const hodPending = await service.list(HOD, filter(ApprovalAssignmentState.PENDING));

  assert.deepEqual(hodPending.rows.map((row) => row.task.reference), [approved.reference, repeated.reference]);
  assert.equal(await service.pendingCount(HOD), 2);
});

test("history has one row per decided step, newest first, with the current step and channel", async () => {
  const page = await service.list(ADVISOR, filter(ApprovalAssignmentState.DECIDED));

  assert.deepEqual(page.rows.map((row) => [row.task.reference, row.step.id]), [
    [repeated.reference, "advisor_review__repeat_1"],
    [repeated.reference, "advisor_review"],
    [approved.reference, "advisor_review"],
  ]);
  assert.equal(page.total, 3);
  const approvedRow = page.rows[2];
  assert.equal(approvedRow?.task.active_step_name, "Head of Department Sign-off");
  assert.equal(approvedRow?.step.approval?.decided_via, ApprovalChannel.APP);
  assert.deepEqual(approvedRow?.task.forms.find((form) => form.step_id === "entry_form")?.submitted_at, at(1).now);
  assert.equal("values" in (approvedRow?.task ?? {}), false);
});

test("history filters by decision and searches reference, title and requester name", async () => {
  const asked = await service.list(ADVISOR, filter(ApprovalAssignmentState.DECIDED, { decision: ApprovalDecision.REQUEST_MORE_INFO }));
  const byName = await service.list(ADVISOR, filter(ApprovalAssignmentState.DECIDED, { search: "hasitha" }));
  const byReference = await service.list(ADVISOR, filter(ApprovalAssignmentState.DECIDED, { search: approved.reference }));
  const byTitle = await service.list(ADVISOR, filter(ApprovalAssignmentState.PENDING, { search: "waiting OVERSEAS" }));
  const escaped = await service.list(ADVISOR, filter(ApprovalAssignmentState.DECIDED, { search: "2026.0(" }));

  assert.deepEqual(asked.rows.map((row) => row.step.id), ["advisor_review"]);
  assert.equal(byName.total, 2);
  assert.equal(byReference.total, 1);
  assert.equal(byTitle.total, 1);
  assert.equal(escaped.total, 0);
});

test("pagination returns the requested window and the full total", async () => {
  const page = await service.list(ADVISOR, filter(ApprovalAssignmentState.DECIDED, { limit: 1, offset: 1 }));

  assert.equal(page.total, 3);
  assert.deepEqual(page.rows.map((row) => row.step.id), ["advisor_review"]);
  assert.equal(page.rows[0]?.task.reference, repeated.reference);
});

test("steps cancelled before a decision appear in neither list", async () => {
  const pending = await service.list(ADVISOR, filter(ApprovalAssignmentState.PENDING));
  const history = await service.list(ADVISOR, filter(ApprovalAssignmentState.DECIDED));

  assert.equal(cancelled.status, TaskStatus.CANCELLED);
  assert.ok(![...pending.rows, ...history.rows].some((row) => row.task.reference === cancelled.reference));
});
