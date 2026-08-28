import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { ApprovalService } from "../../../src/services/approval.service.js";
import { ExecutionService } from "../../../src/services/execution.service.js";
import { NotificationService } from "../../../src/services/notification.service.js";
import { TaskService } from "../../../src/services/task.service.js";
import { PlannerService } from "../../../src/services/planner.service.js";
import { issueToken } from "../../../src/utils/approval/token.util.js";
import { NotFoundError } from "../../../src/errors/not-found.error.js";
import { ValidationError } from "../../../src/errors/validation.error.js";
import { ConflictError } from "../../../src/errors/conflict.error.js";
import { STEP_STATE, TASK_STATUS } from "../../../src/data/constants/status.constant.js";
import { FakeAuditLogModel, FakeTaskModel } from "../../helpers/fake-model.helper.js";
import { AuditService } from "../../../src/services/audit.service.js";
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
    completion_document: null,
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
  const taskService = new TaskService({
    taskModel: taskModel as unknown as ConstructorParameters<typeof TaskService>[0]["taskModel"],
    selectionService: {} as unknown as ConstructorParameters<typeof TaskService>[0]["selectionService"],
    workflowService: fakeWorkflowService(workflow),
    plannerService: new PlannerService(),
    executionService,
    notificationService,
    auditService: new AuditService({
      auditLogModel: new FakeAuditLogModel() as unknown as ConstructorParameters<
        typeof AuditService
      >[0]["auditLogModel"],
    }),
    config: FAKE_CONFIG,
  });
  const service = new ApprovalService({
    taskModel: taskModel as unknown as ConstructorParameters<typeof ApprovalService>[0]["taskModel"],
    workflowService: fakeWorkflowService(workflow),
    executionService,
    notificationService,
    taskService,
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

test("getApproverView evaluates the workflow's computed values from the requester's answers", async () => {
  const taskModel = new FakeTaskModel();
  const base = finalizedTask(LEAVE_WORKFLOW, {
    values: { departure_date: "2026-03-01", return_date: "2026-03-10" },
  });
  const inserted = await taskModel.insert(base);
  const dispatched = dispatchAdvisorStep(inserted);
  await taskModel.updateStepAndStatus(dispatched._id, dispatched.steps, TASK_STATUS.IN_PROGRESS);
  const task = (await taskModel.findById(dispatched._id))!;
  const { service } = build(taskModel);
  const token = task.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  const view = await service.getApproverView(token);

  assert.deepEqual(view.computed, [
    { label: "Total days between departure and return, inclusive.", value: "10" },
  ]);
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

test("submitDecision on an expired token throws ConflictError", async () => {
  const taskModel = new FakeTaskModel();
  const task = await seedDispatchedTask(taskModel);
  const { service } = build(taskModel);
  const step = task.steps.find((s) => s.step_id === "advisor_review")!;
  const token = step.approval_token!;

  const expired = task.steps.map((s) =>
    s.step_id === "advisor_review" ? { ...s, token_expires_at: new Date(Date.now() - 1000) } : s,
  );
  await taskModel.updateStepAndStatus(task._id, expired, TASK_STATUS.IN_PROGRESS);

  await assert.rejects(() => service.submitDecision(token, "approved", null), ConflictError);
});

test("a token that expires in the future is still accepted", async () => {
  const taskModel = new FakeTaskModel();
  const task = await seedDispatchedTask(taskModel);
  const { service } = build(taskModel);
  const token = task.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  const result = await service.submitDecision(token, "approved", null);

  assert.equal(result.outcome, "approved");
});

test("getApproverView still renders for an expired token", async () => {
  const taskModel = new FakeTaskModel();
  const task = await seedDispatchedTask(taskModel);
  const { service } = build(taskModel);
  const token = task.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  const expired = task.steps.map((s) =>
    s.step_id === "advisor_review" ? { ...s, token_expires_at: new Date(Date.now() - 1000) } : s,
  );
  await taskModel.updateStepAndStatus(task._id, expired, TASK_STATUS.IN_PROGRESS);

  const view = await service.getApproverView(token);

  assert.equal(view.step.step_id, "advisor_review");
  assert.equal(view.already_decided, false);
});

test("submitDecision on a step that is no longer pending_approval throws ConflictError", async () => {
  const taskModel = new FakeTaskModel();
  const task = await seedDispatchedTask(taskModel);
  const { service } = build(taskModel);
  const token = task.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  const skipped = task.steps.map((s) =>
    s.step_id === "advisor_review" ? { ...s, state: STEP_STATE.SKIPPED } : s,
  );
  await taskModel.updateStepAndStatus(task._id, skipped, TASK_STATUS.IN_PROGRESS);

  await assert.rejects(() => service.submitDecision(token, "approved", null), ConflictError);
});

test("approvers lists every actor requirement, ordered by workflow step order", async () => {
  const taskModel = new FakeTaskModel();
  const task = await seedDispatchedTask(taskModel);
  const { service } = build(taskModel);
  const token = task.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  const view = await service.getApproverView(token);

  assert.deepEqual(
    view.approvers.map((a) => a.step_id),
    ["advisor_review", "hod_review", "dean_review"],
  );
});

test("approvers marks the dispatched step 'awaiting' and downstream steps 'not_yet_reached'", async () => {
  const taskModel = new FakeTaskModel();
  const task = await seedDispatchedTask(taskModel);
  const { service } = build(taskModel);
  const token = task.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  const view = await service.getApproverView(token);
  const byStep = new Map(view.approvers.map((a) => [a.step_id, a]));

  assert.equal(byStep.get("advisor_review")?.status, "awaiting");
  assert.equal(byStep.get("advisor_review")?.is_current, true);
  assert.equal(byStep.get("hod_review")?.status, "not_yet_reached");
  assert.equal(byStep.get("hod_review")?.is_current, false);
});

test("approvers reports a decided step's outcome and decided_at", async () => {
  const taskModel = new FakeTaskModel();
  const task = await seedDispatchedTask(taskModel);
  const { service } = build(taskModel);
  const token = task.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  await service.submitDecision(token, "approved", null);

  const hodToken = (await taskModel.findById(task._id))!.steps.find((s) => s.step_id === "hod_review")!
    .approval_token!;
  const view = await service.getApproverView(hodToken);
  const advisor = view.approvers.find((a) => a.step_id === "advisor_review");

  assert.equal(advisor?.status, "approved");
  assert.ok(advisor?.decided_at);
});

test("approvers uses the requirement's designation label, not the raw actor key", async () => {
  const taskModel = new FakeTaskModel();
  const task = await seedDispatchedTask(taskModel);
  const { service } = build(taskModel);
  const token = task.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  const view = await service.getApproverView(token);
  const advisor = view.approvers.find((a) => a.step_id === "advisor_review");

  assert.equal(advisor?.designation, "Academic Advisor");
  assert.ok(!advisor?.designation.startsWith("actor:"));
});

test("approvers reports null name/email for a step whose assignee was never supplied (deduped-actor case)", async () => {
  // Finding 3: when two steps share a role, buildActorRequirements dedupes to one
  // requirement keyed to the first step, so the second step's requirement.ref can point
  // at a task.steps entry whose assignee is legitimately null. The approver list must
  // reflect that as "not yet supplied", not throw or fall back to step.assignee.
  const taskModel = new FakeTaskModel();
  const base = finalizedTask(LEAVE_WORKFLOW);
  const withNullAssignee: TaskDocument = {
    ...base,
    steps: base.steps.map((s) => (s.step_id === "hod_review" ? { ...s, assignee: null } : s)),
  };
  const inserted = await taskModel.insert(withNullAssignee);
  const dispatched = dispatchAdvisorStep(inserted);
  await taskModel.updateStepAndStatus(dispatched._id, dispatched.steps, TASK_STATUS.IN_PROGRESS);
  const { service } = build(taskModel);
  const token = dispatched.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  const view = await service.getApproverView(token);
  const hod = view.approvers.find((a) => a.step_id === "hod_review");

  assert.equal(hod?.name, null);
  assert.equal(hod?.email, null);
  assert.equal(hod?.status, "not_yet_reached");
});

test("requesting more info reopens the step, clears its token, and moves the task back to collecting", async () => {
  const taskModel = new FakeTaskModel();
  const task = await seedDispatchedTask(taskModel);
  const { service } = build(taskModel);
  const token = task.steps.find((s) => s.step_id === "advisor_review")!.approval_token!;

  await service.submitDecision(token, "request_more_info", "Please attach your travel itinerary.");

  const updated = await taskModel.findById(task._id);
  assert.equal(updated!.status, "collecting");

  const advisorStep = updated!.steps.find((s) => s.step_id === "advisor_review");
  assert.equal(advisorStep?.state, STEP_STATE.READY);
  assert.equal(advisorStep?.reopen_count, 1);
  assert.equal(advisorStep?.approval_token, null);

  const followup = updated!.requirements.find((r) => r.key === "followup:advisor_review:1");
  assert.ok(followup);
  assert.equal(followup?.label, "Please attach your travel itinerary.");
});
