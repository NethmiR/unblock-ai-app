import test from "node:test";
import assert from "node:assert/strict";
import { ApprovalErrorCode } from "../../../src/data/constants/approval-error.constant.js";
import { ApprovalChannel, ApprovalDecision, TaskCreationSource, TaskStatus, TaskStepStatus } from "../../../src/data/constants/task.constant.js";
import { approverIdentityOf } from "../../../src/utils/approval/approver-identity.util.js";
import type { ApproverIdentity } from "../../../src/lib/types/approval/approver-identity.type.js";
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

const ADVISOR: ApproverIdentity = approverIdentityOf({ id: "user-advisor", email: "Advisor@U.C" });

function identityOf(bed: TaskTestbed, fullName: string, email: string): ApproverIdentity {
  return approverIdentityOf({ id: bed.world.userIdOf(fullName), email });
}

async function approveAdvisorInApp(dispatched: Dispatched): Promise<void> {
  await dispatched.bed.approvalService.decideAsAssignee(dispatched.taskId, "advisor_review", ADVISOR, { decision: ApprovalDecision.APPROVED, comment: null });
}

test("a requester-supplied approver matched by email decides in the app, and the decision records the app channel", async () => {
  const dispatched = await dispatchedLeave();
  const { bed, taskId } = dispatched;

  const view = await bed.approvalService.getViewForAssignee(taskId, "advisor_review", ADVISOR);
  assert.equal(view.context.live, true);
  assert.deepEqual(view.allowedDecisions, [ApprovalDecision.APPROVED, ApprovalDecision.REJECTED, ApprovalDecision.REQUEST_MORE_INFO]);

  await approveAdvisorInApp(dispatched);
  const approval = (await bed.taskService.get(taskId)).steps.find((step) => step.id === "advisor_review")?.approval;
  assert.deepEqual([approval?.decided_via, approval?.decided_by_user_id], [ApprovalChannel.APP, "user-advisor"]);
});

test("a directory assignee views and decides in the app by user id", async () => {
  const dispatched = await dispatchedLeave();
  const { bed, taskId } = dispatched;
  await approveAdvisorInApp(dispatched);
  const dinesh = identityOf(bed, "Dinesh Wijesinghe", "someone-else@u.c");

  const view = await bed.approvalService.getViewForAssignee(taskId, "hod_review", dinesh);
  const result = await bed.approvalService.decideAsAssignee(taskId, "hod_review", dinesh, { decision: ApprovalDecision.APPROVED, comment: null });

  assert.equal(view.context.step.assignee?.user_id, dinesh.userId);
  assert.equal(result.next_step_name, "Dean of IT Faculty Approval");
});

test("a non-assignee, the requester and an unknown step all get approval not found", async () => {
  const { bed, taskId } = await dispatchedLeave();
  const stranger = approverIdentityOf({ id: "user-stranger", email: "stranger@u.c" });
  const requesterAsAdvisor = approverIdentityOf({ id: bed.world.userIdOf("Kavindu Jayawardena"), email: "advisor@u.c" });
  const notFound = withErrorCode(ApprovalErrorCode.APPROVAL_NOT_FOUND);

  await assert.rejects(bed.approvalService.getViewForAssignee(taskId, "advisor_review", stranger), notFound);
  await assert.rejects(bed.approvalService.decideAsAssignee(taskId, "advisor_review", stranger, { decision: ApprovalDecision.APPROVED, comment: null }), notFound);
  await assert.rejects(bed.approvalService.getViewForAssignee(taskId, "advisor_review", requesterAsAdvisor), notFound);
  await assert.rejects(bed.approvalService.getViewForAssignee(taskId, "entry_form", ADVISOR), notFound);
  await assert.rejects(bed.approvalService.getViewForAssignee(taskId, "missing", ADVISOR), notFound);
  await assert.rejects(bed.approvalService.getViewForAssignee("not-an-id", "advisor_review", ADVISOR), notFound);
});

test("a decided step shows the decision in the app and refuses a second decision", async () => {
  const dispatched = await dispatchedLeave();
  const { bed, taskId } = dispatched;
  await approveAdvisorInApp(dispatched);

  const view = await bed.approvalService.getViewForAssignee(taskId, "advisor_review", ADVISOR);

  assert.equal(view.context.live, false);
  assert.deepEqual(view.allowedDecisions, []);
  await assert.rejects(
    bed.approvalService.decideAsAssignee(taskId, "advisor_review", ADVISOR, { decision: ApprovalDecision.REJECTED, comment: "Late" }),
    withErrorCode(ApprovalErrorCode.APPROVAL_ALREADY_DECIDED),
  );
});

test("an expired link or a missing link does not block the in-app decision", async () => {
  let now = new Date("2026-11-13T09:00:00Z");
  const expired = await dispatchedLeave({ now: () => now });
  now = new Date("2026-12-31T09:00:00Z");
  await approveAdvisorInApp(expired);
  assert.equal((await expired.bed.taskService.get(expired.taskId)).steps.find((step) => step.id === "advisor_review")?.status, TaskStepStatus.COMPLETED);

  const unsent = await dispatchedLeave();
  const stored = unsent.bed.taskModel.tasks.get(unsent.taskId);
  assert.ok(stored);
  unsent.bed.taskModel.tasks.set(unsent.taskId, {
    ...stored,
    steps: stored.steps.map((step) => (step.approval ? { ...step, approval: { ...step.approval, token_hash: null, token_expires_at: null, notified_at: null } } : step)),
  });
  await approveAdvisorInApp(unsent);
  assert.equal((await unsent.bed.taskService.get(unsent.taskId)).steps.find((step) => step.id === "advisor_review")?.outcome, "approved");
});

test("an in-app decision kills the emailed link, which then shows the decision", async () => {
  const dispatched = await dispatchedLeave();
  const token = dispatched.notifier.tokenFor("advisor_review");
  await approveAdvisorInApp(dispatched);

  const view = await dispatched.bed.approvalService.getView(token);

  assert.equal(view.context.live, false);
  assert.equal(view.context.step.approval?.token_hash, null);
  await assert.rejects(dispatched.bed.approvalService.decide(token, { decision: ApprovalDecision.APPROVED, comment: null }), withErrorCode(ApprovalErrorCode.APPROVAL_ALREADY_DECIDED));
});

test("the comment rules apply to the in-app channel too, and the link channel records itself", async () => {
  const { bed, notifier, taskId } = await dispatchedLeave();

  for (const decision of [ApprovalDecision.REJECTED, ApprovalDecision.REQUEST_MORE_INFO]) {
    await assert.rejects(
      bed.approvalService.decideAsAssignee(taskId, "advisor_review", ADVISOR, { decision, comment: null }),
      withErrorCode(ApprovalErrorCode.APPROVAL_COMMENT_REQUIRED),
    );
  }
  await bed.approvalService.decide(notifier.tokenFor("advisor_review"), { decision: ApprovalDecision.APPROVED, comment: null });
  const approval = (await bed.taskService.get(taskId)).steps.find((step) => step.id === "advisor_review")?.approval;
  assert.deepEqual([approval?.decided_via, approval?.decided_by_user_id], [ApprovalChannel.EMAIL_LINK, null]);
});
