import test from "node:test";
import assert from "node:assert/strict";
import type { ObjectId } from "mongodb";
import { TaskService } from "../../../src/services/task.service.js";
import { PlannerService } from "../../../src/services/planner.service.js";
import { ExecutionService } from "../../../src/services/execution.service.js";
import { NotificationService } from "../../../src/services/notification.service.js";
import { ConflictError } from "../../../src/errors/conflict.error.js";
import { ValidationError } from "../../../src/errors/validation.error.js";
import { FakeTaskModel } from "../../helpers/fake-model.helper.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import type { SelectionService } from "../../../src/services/selection.service.js";
import type { WorkflowService } from "../../../src/services/workflow.service.js";
import type { IMailer } from "../../../src/services/mailer/mailer.interface.js";
import type { AppConfig } from "../../../src/lib/types/config/config.type.js";
import type { WorkflowDefinition } from "../../../src/lib/types/workflow/workflow.type.js";
import type { TemplateDocument } from "../../../src/lib/types/template/template.type.js";

function fakeSelectionService(workflow: WorkflowDefinition | null): SelectionService {
  return {
    getMatchedWorkflow() {
      if (!workflow) throw new ConflictError("This session has not matched a workflow yet");
      return Promise.resolve(workflow);
    },
  } as unknown as SelectionService;
}

function fakeWorkflowService(workflow: WorkflowDefinition): WorkflowService {
  return {
    getRecord() {
      return Promise.resolve({
        workflow_id: workflow.workflow_id,
        version: 1,
      } as unknown as TemplateDocument);
    },
    getDocument() {
      return Promise.resolve(workflow);
    },
  } as unknown as WorkflowService;
}

const fakeConfig = {
  mail: { appPublicUrl: "http://localhost:3001", tokenSecret: "test-secret", tokenTtlDays: 14 },
} as unknown as AppConfig;

const fakeMailer: IMailer = { send: () => Promise.resolve({ sent: true, error: null }) };

function build({
  taskModel,
  workflow,
  matched = true,
}: {
  taskModel: FakeTaskModel;
  workflow: WorkflowDefinition;
  matched?: boolean;
}): TaskService {
  return new TaskService({
    taskModel: taskModel as unknown as ConstructorParameters<typeof TaskService>[0]["taskModel"],
    selectionService: fakeSelectionService(matched ? workflow : null),
    workflowService: fakeWorkflowService(workflow),
    plannerService: new PlannerService(),
    executionService: new ExecutionService(),
    notificationService: new NotificationService({ mailer: fakeMailer, config: fakeConfig }),
    config: fakeConfig,
  });
}

const LEAVE_WORKFLOW = loadExpectedFixture("it_faculty_overseas_leave.json");

test("create() from an unmatched session throws ConflictError", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW, matched: false });

  await assert.rejects(() => service.create("session-1"), ConflictError);
});

test("setValue() on a finalized task throws ConflictError", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW });

  const task = await service.create("session-1");
  await taskModel.setStatus(task._id, "ready");

  await assert.rejects(
    () => service.setValue(task._id, "full_name", "Jane Doe"),
    ConflictError,
  );
});

test("setValue() with an unknown key throws ValidationError", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW });

  const task = await service.create("session-1");

  await assert.rejects(
    () => service.setValue(task._id, "not_a_real_key", "value"),
    ValidationError,
  );
});

test("finalize() with a missing required requirement throws ValidationError naming the key", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW });

  const task = await service.create("session-1");

  await assert.rejects(() => service.finalize(task._id), (err: unknown) => {
    assert.ok(err instanceof ValidationError);
    assert.match(err.message, /full_name/);
    return true;
  });
});

async function fillAllRequirements(service: TaskService, taskId: ObjectId): Promise<void> {
  const values: Record<string, unknown> = {
    full_name: "Jane Doe",
    student_index_number: "IT/2020/123",
    destination_country: "Japan",
    destination_city: "Tokyo",
    departure_date: "2027-01-01",
    return_date: "2027-01-10",
    travel_reason: "Conference attendance",
    requester_email: "jane.doe@example.com",
    "actor:advisor_review": { name: "Dr. Advisor", email: "advisor@example.com" },
    "actor:hod_review": { name: "Prof. Hod", email: "hod@example.com" },
    "actor:dean_review": { name: "Dean Dean", email: "dean@example.com" },
  };
  for (const [key, value] of Object.entries(values)) {
    await service.setValue(taskId, key, value);
  }
}

test("finalize() on the leave fixture: advisor_review is READY, the other two are BLOCKED", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW });

  const task = await service.create("session-1");
  await fillAllRequirements(service, task._id);

  const finalized = await service.finalize(task._id);

  assert.equal(finalized.status, "ready");
  assert.equal(finalized.steps.length, 3);

  const byId = new Map(finalized.steps.map((s) => [s.step_id, s]));
  assert.equal(byId.get("advisor_review")?.state, "ready");
  assert.equal(byId.get("hod_review")?.state, "blocked");
  assert.equal(byId.get("dean_review")?.state, "blocked");
});

test("finalize() attaches the collected advisor to advisor_review.assignee", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW });

  const task = await service.create("session-1");
  await fillAllRequirements(service, task._id);

  const finalized = await service.finalize(task._id);
  const advisorStep = finalized.steps.find((s) => s.step_id === "advisor_review");

  assert.deepEqual(advisorStep?.assignee, { name: "Dr. Advisor", email: "advisor@example.com" });
});

test("start() on a non-ready task throws ConflictError", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW });

  const task = await service.create("session-1");

  await assert.rejects(() => service.start(task._id), ConflictError);
});

test("start() dispatches advisor_review, issues a token, and moves the task to in_progress", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW });

  const task = await service.create("session-1");
  await fillAllRequirements(service, task._id);
  await service.finalize(task._id);

  const started = await service.start(task._id);

  assert.equal(started.status, "in_progress");
  const advisorStep = started.steps.find((s) => s.step_id === "advisor_review");
  assert.equal(advisorStep?.state, "pending_approval");
  assert.ok(advisorStep?.approval_token);
  assert.ok(advisorStep?.token_expires_at);
});

test("getStatus() surfaces the current pending step before any decision", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW });

  const task = await service.create("session-1");
  await fillAllRequirements(service, task._id);
  await service.finalize(task._id);
  await service.start(task._id);

  const status = await service.getStatus(task._id);

  assert.equal(status.status, "in_progress");
  assert.deepEqual(status.current_steps, ["advisor_review"]);
  assert.equal(status.reason, null);
});

test("reopenForMoreInfo() appends exactly one pending requirement and returns status to collecting", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW });

  const task = await service.create("session-1");
  await fillAllRequirements(service, task._id);
  await service.finalize(task._id);
  await service.start(task._id);

  const beforeCount = (await service.get(task._id)).requirements.length;
  const reopened = await service.reopenForMoreInfo(
    task._id,
    "advisor_review",
    "Please attach your travel itinerary.",
  );

  assert.equal(reopened.status, "collecting");
  assert.equal(reopened.requirements.length, beforeCount + 1);

  const followup = reopened.requirements.find((r) => r.key === "followup:advisor_review:0");
  assert.ok(followup);
  assert.equal(followup?.status, "pending");
  assert.equal(followup?.required, true);
  assert.equal(followup?.label, "Please attach your travel itinerary.");
});

test("re-finalize after a reopen dispatches only the reopened step, leaving approved steps approved", async () => {
  const taskModel = new FakeTaskModel();
  const service = build({ taskModel, workflow: LEAVE_WORKFLOW });

  const task = await service.create("session-1");
  await fillAllRequirements(service, task._id);
  await service.finalize(task._id);
  await service.start(task._id);

  const engine = new ExecutionService();
  const workflow = LEAVE_WORKFLOW;
  const current = await service.get(task._id);
  const decided = engine.applyDecision(current, workflow, "advisor_review", "approved", null);
  await taskModel.updateStepAndStatus(task._id, decided.steps, decided.status);

  const afterAdvisorApproved = await service.get(task._id);
  const reopenedHod = engine.applyDecision(
    afterAdvisorApproved,
    workflow,
    "hod_review",
    "request_more_info",
    "Need the signed advisor form.",
  );
  await taskModel.updateStepAndStatus(task._id, reopenedHod.steps, afterAdvisorApproved.status);

  await service.reopenForMoreInfo(task._id, "hod_review", "Need the signed advisor form.");
  await service.setValue(task._id, "followup:hod_review:1", "Attached.");

  const refinalized = await service.finalize(task._id);

  assert.equal(refinalized.status, "in_progress");
  const byId = new Map(refinalized.steps.map((s) => [s.step_id, s]));
  assert.equal(byId.get("advisor_review")?.state, "approved");
  assert.equal(byId.get("advisor_review")?.outcome, "approved");
  assert.equal(byId.get("hod_review")?.state, "pending_approval");
  assert.ok(byId.get("hod_review")?.approval_token);
  assert.equal(byId.get("dean_review")?.state, "blocked");
});
