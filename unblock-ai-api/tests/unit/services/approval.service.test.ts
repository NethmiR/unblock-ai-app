import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { ApprovalService } from "../../../src/services/approval.service.js";
import { ExecutionService } from "../../../src/services/execution.service.js";
import { NotificationService } from "../../../src/services/notification.service.js";
import { PlannerService } from "../../../src/services/planner.service.js";
import { issueToken } from "../../../src/utils/approval/token.util.js";
import { NotFoundError } from "../../../src/errors/not-found.error.js";
import { ValidationError } from "../../../src/errors/validation.error.js";
import { ConflictError } from "../../../src/errors/conflict.error.js";
import { STEP_STATE, TASK_STATUS } from "../../../src/data/constants/status.constant.js";
import { FakeTaskModel } from "../../helpers/fake-model.helper.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import type { IMailer } from "../../../src/services/mailer/mailer.interface.js";
import type { MailMessage, MailSendResult } from "../../../src/lib/types/approval/mail.type.js";
import type { AppConfig } from "../../../src/lib/types/config/config.type.js";
import type { WorkflowService } from "../../../src/services/workflow.service.js";
import type { TaskDocument, TaskStepState } from "../../../src/lib/types/task/task.type.js";
import type { WorkflowDefinition } from "../../../src/lib/types/workflow/workflow.type.js";

const LEAVE_WORKFLOW = loadExpectedFixture("it_faculty_overseas_leave.json");
const SECRET = "test-secret";

const FAKE_CONFIG = {
  mail: { appPublicUrl: "https://unblock.example", tokenSecret: SECRET, tokenTtlDays: 14 },
} as unknown as AppConfig;

class FakeMailer implements IMailer {
  readonly sent: MailMessage[] = [];
  send(message: MailMessage): Promise<MailSendResult> {
    this.sent.push(message);
    return Promise.resolve({ sent: true, error: null });
  }
}

function fakeWorkflowService(workflow: WorkflowDefinition): WorkflowService {
  return {
    getDocument() {
      return Promise.resolve(workflow);
    },
  } as unknown as WorkflowService;
}

function finalizedTask(workflow: WorkflowDefinition, overrides: Partial<TaskDocument> = {}): TaskDocument {
  const planner = new PlannerService();
  const { requirements, steps } = planner.compile(workflow);
  const now = new Date();

  const seeded: TaskStepState[] = steps.map((step) => ({
    ...step,
    state: step.depends_on.length === 0 ? STEP_STATE.READY : STEP_STATE.BLOCKED,
    assignee: { name: `${step.step_id} approver`, email: `${step.step_id}@example.com` },
  }));

  return {
    _id: new ObjectId(),
    reference: "TASK-2026-00099",
    session_id: "session-1",
    workflow_id: workflow.workflow_id,
    version: 1,
    status: TASK_STATUS.IN_PROGRESS,
    requirements,
    values: {},
    steps: seeded,
    audit: [],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function dispatchAdvisorStep(task: TaskDocument): TaskDocument {
  const engine = new ExecutionService();
  const result = engine.advance(task, LEAVE_WORKFLOW);
  const token = issueToken(String(task._id), "advisor_review", SECRET);
  const steps = result.steps.map((s) =>
    s.step_id === "advisor_review"
      ? { ...s, approval_token: token, token_expires_at: new Date(Date.now() + 86400000) }
      : s,
  );
  return { ...task, steps };
}

function build(taskModel: FakeTaskModel, workflow: WorkflowDefinition = LEAVE_WORKFLOW) {
  const mailer = new FakeMailer();
  const notificationService = new NotificationService({ mailer, config: FAKE_CONFIG });
  const executionService = new ExecutionService();
  const service = new ApprovalService({
    taskModel: taskModel as unknown as ConstructorParameters<typeof ApprovalService>[0]["taskModel"],
    workflowService: fakeWorkflowService(workflow),
    executionService,
    notificationService,
    config: FAKE_CONFIG,
  });
  return { service, mailer };
}

async function seedDispatchedTask(taskModel: FakeTaskModel): Promise<TaskDocument> {
  const base = finalizedTask(LEAVE_WORKFLOW);
  const inserted = await taskModel.insert(base);
  const dispatched = dispatchAdvisorStep(inserted);
  await taskModel.updateStepAndStatus(dispatched._id, dispatched.steps, TASK_STATUS.IN_PROGRESS);
  return (await taskModel.findById(dispatched._id))!;
}

test("getApproverView with an invalid token throws NotFoundError", async () => {
  const taskModel = new FakeTaskModel();
  const { service } = build(taskModel);

  await assert.rejects(() => service.getApproverView("garbage"), NotFoundError);
});

test("submitDecision rejecting with no reason throws ValidationError", async () => {
  const taskModel = new FakeTaskModel();
  const task = await seedDispatchedTask(taskModel);
  const { service } = build(taskModel);
  const token = task.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  await assert.rejects(() => service.submitDecision(token, "rejected", null), ValidationError);
});

test("submitDecision rejecting with a whitespace-only reason throws ValidationError", async () => {
  const taskModel = new FakeTaskModel();
  const task = await seedDispatchedTask(taskModel);
  const { service } = build(taskModel);
  const token = task.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  await assert.rejects(() => service.submitDecision(token, "rejected", "   "), ValidationError);
});

test("submitDecision rejecting with a reason terminates the task and the reason is stored", async () => {
  const taskModel = new FakeTaskModel();
  const task = await seedDispatchedTask(taskModel);
  const { service } = build(taskModel);
  const token = task.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  const result = await service.submitDecision(token, "rejected", "Exams that week.");

  assert.equal(result.status, TASK_STATUS.REJECTED);
  assert.equal(result.terminated, true);

  const updated = await taskModel.findById(task._id);
  const advisorStep = updated!.steps.find((s) => s.step_id === "advisor_review");
  assert.equal(advisorStep?.reason, "Exams that week.");
  assert.equal(updated!.status, TASK_STATUS.REJECTED);
});

test("a second decision on an already-used token throws ConflictError", async () => {
  const taskModel = new FakeTaskModel();
  const task = await seedDispatchedTask(taskModel);
  const { service } = build(taskModel);
  const token = task.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  await service.submitDecision(token, "approved", null);

  await assert.rejects(() => service.submitDecision(token, "approved", null), ConflictError);
});

test("getApproverView on a used token returns already_decided true", async () => {
  const taskModel = new FakeTaskModel();
  const task = await seedDispatchedTask(taskModel);
  const { service } = build(taskModel);
  const token = task.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  await service.submitDecision(token, "approved", null);
  const view = await service.getApproverView(token);

  assert.equal(view.already_decided, true);
  assert.equal(view.decided_outcome, "approved");
});

test("allowed_outcomes reflects only the outcomes the step declares", async () => {
  const taskModel = new FakeTaskModel();
  const task = await seedDispatchedTask(taskModel);
  const { service } = build(taskModel);
  const token = task.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  const view = await service.getApproverView(token);

  assert.deepEqual(new Set(view.allowed_outcomes), new Set(["approved", "rejected", "request_more_info"]));
});

test("approving advisor_review dispatches hod_review and sends a notification", async () => {
  const taskModel = new FakeTaskModel();
  const task = await seedDispatchedTask(taskModel);
  const { service, mailer } = build(taskModel);
  const token = task.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  await service.submitDecision(token, "approved", null);

  const updated = await taskModel.findById(task._id);
  const hodStep = updated!.steps.find((s) => s.step_id === "hod_review");
  assert.equal(hodStep?.state, STEP_STATE.PENDING_APPROVAL);
  assert.ok(hodStep?.approval_token);
  assert.equal(mailer.sent.length, 1);
});
