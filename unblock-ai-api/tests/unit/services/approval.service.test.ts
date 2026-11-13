import test from "node:test";
import assert from "node:assert/strict";
import { ApprovalErrorCode } from "../../../src/data/constants/approval-error.constant.js";
import { ApprovalDecision, TaskCreationSource, TaskStatus, TaskStepStatus } from "../../../src/data/constants/task.constant.js";
import { issueToken } from "../../../src/utils/approval/token.util.js";
import { withErrorCode } from "../../helpers/error-assertion.helper.js";
import { IT_LEAVE_ID } from "../../helpers/selection-testbed.helper.js";
import {
  createTaskTestbed,
  ENTRY_FORM_ID,
  leaveEntryValues,
  RecordingNotifier,
  TEST_MAIL_CONFIG,
  type TaskTestbed,
} from "../../helpers/task-testbed.helper.js";

interface Dispatched {
  bed: TaskTestbed;
  notifier: RecordingNotifier;
  taskId: string;
}

async function dispatchedLeave(options: { now?: () => Date; returnDate?: string } = {}): Promise<Dispatched> {
  const notifier = new RecordingNotifier();
  const bed = await createTaskTestbed({ notifier, now: options.now });
  const task = await bed.taskService.create(bed.world.userIdOf("Kavindu Jayawardena"), { source: TaskCreationSource.CATALOGUE, workflowTemplateId: IT_LEAVE_ID });
  const taskId = String(task._id);
  await bed.taskFormService.submit(taskId, ENTRY_FORM_ID, leaveEntryValues(options.returnDate));
  return { bed, notifier, taskId };
}

test("the approver view shows the request, the plan and the allowed decisions", async () => {
  const { bed, notifier } = await dispatchedLeave();

  const view = await bed.approvalService.getView(notifier.tokenFor("advisor_review"));

  assert.equal(view.context.step.id, "advisor_review");
  assert.equal(view.context.live, true);
  assert.deepEqual(view.allowedDecisions, [ApprovalDecision.APPROVED, ApprovalDecision.REJECTED, ApprovalDecision.REQUEST_MORE_INFO]);
  assert.ok(view.computed.some((field) => field.value === "40"));
  assert.equal(notifier.calls[0]?.to, "advisor@u.c");
});

test("a forged or unknown link is invalid", async () => {
  const { bed, taskId } = await dispatchedLeave();

  await assert.rejects(bed.approvalService.getView("garbage"), withErrorCode(ApprovalErrorCode.APPROVAL_LINK_INVALID));
  await assert.rejects(
    bed.approvalService.getView(issueToken(taskId, "advisor_review", TEST_MAIL_CONFIG.tokenSecret)),
    withErrorCode(ApprovalErrorCode.APPROVAL_LINK_INVALID),
  );
  await assert.rejects(
    bed.approvalService.getView(issueToken(taskId, "advisor_review", "wrong-secret")),
    withErrorCode(ApprovalErrorCode.APPROVAL_LINK_INVALID),
  );
});

test("an expired link returns gone", async () => {
  let now = new Date("2026-11-13T09:00:00Z");
  const { bed, notifier } = await dispatchedLeave({ now: () => now });
  now = new Date("2026-12-31T09:00:00Z");

  await assert.rejects(bed.approvalService.getView(notifier.tokenFor("advisor_review")), withErrorCode(ApprovalErrorCode.APPROVAL_LINK_EXPIRED));
});

test("a comment is required to reject or ask for more information", async () => {
  const { bed, notifier } = await dispatchedLeave();
  const token = notifier.tokenFor("advisor_review");

  for (const decision of [ApprovalDecision.REJECTED, ApprovalDecision.REQUEST_MORE_INFO]) {
    await assert.rejects(bed.approvalService.decide(token, { decision, comment: "   " }), withErrorCode(ApprovalErrorCode.APPROVAL_COMMENT_REQUIRED));
  }
});

test("a decided link shows the decision and refuses a second one", async () => {
  const { bed, notifier } = await dispatchedLeave();
  const token = notifier.tokenFor("advisor_review");

  const result = await bed.approvalService.decide(token, { decision: ApprovalDecision.APPROVED, comment: null });
  const view = await bed.approvalService.getView(token);

  assert.deepEqual(result, { decision: ApprovalDecision.APPROVED, task_status: TaskStatus.IN_PROGRESS, next_step_name: "Head of Department Sign-off" });
  assert.equal(view.context.live, false);
  assert.deepEqual(view.allowedDecisions, []);
  assert.equal(view.context.step.approval?.decision, ApprovalDecision.APPROVED);
  await assert.rejects(bed.approvalService.decide(token, { decision: ApprovalDecision.APPROVED, comment: null }), withErrorCode(ApprovalErrorCode.APPROVAL_ALREADY_DECIDED));
  assert.equal(notifier.calls.at(-1)?.to, "u19@u.c");
});

test("asking for more information emails the requester and the repeat review gets a new link after the answer", async () => {
  const { bed, notifier, taskId } = await dispatchedLeave();
  const firstToken = notifier.tokenFor("advisor_review");

  await bed.approvalService.decide(firstToken, { decision: ApprovalDecision.REQUEST_MORE_INFO, comment: "Which institute?" });
  assert.ok(notifier.calls.some((call) => call.kind === "information_requested" && call.to === "u17@u.c"));

  await bed.taskFormService.submit(taskId, "advisor_review__information_request_1__form", { "responses.advisor_review__information_request_1": "Tokyo Tech" });
  const repeatToken = notifier.tokenFor("advisor_review__repeat_1");
  assert.notEqual(repeatToken, firstToken);

  const view = await bed.approvalService.getView(repeatToken);
  assert.equal(view.context.step.origin, "approval_repeat");
});

test("a rejection terminates the task and revokes the other links", async () => {
  const { bed, notifier, taskId } = await dispatchedLeave();

  const result = await bed.approvalService.decide(notifier.tokenFor("advisor_review"), { decision: ApprovalDecision.REJECTED, comment: "Exams" });

  const task = await bed.taskService.get(taskId);
  assert.equal(result.task_status, TaskStatus.REJECTED);
  assert.ok(task.steps.every((step) => step.approval === null || step.approval.token_hash === null));
  assert.equal(task.steps.find((step) => step.id === "hod_review")?.status, TaskStepStatus.CANCELLED);
  assert.ok(notifier.calls.some((call) => call.kind === "rejected"));
});

test("approving through to the end completes the task and sends the completion email", async () => {
  const { bed, notifier, taskId } = await dispatchedLeave();

  await bed.approvalService.decide(notifier.tokenFor("advisor_review"), { decision: ApprovalDecision.APPROVED, comment: null });
  await bed.approvalService.decide(notifier.tokenFor("hod_review"), { decision: ApprovalDecision.APPROVED, comment: null });
  const result = await bed.approvalService.decide(notifier.tokenFor("dean_review"), { decision: ApprovalDecision.APPROVED, comment: "Enjoy" });

  assert.equal(result.task_status, TaskStatus.COMPLETED);
  assert.equal(result.next_step_name, null);
  assert.equal((await bed.taskService.get(taskId)).status, TaskStatus.COMPLETED);
  assert.ok(notifier.calls.some((call) => call.kind === "completed"));
});
