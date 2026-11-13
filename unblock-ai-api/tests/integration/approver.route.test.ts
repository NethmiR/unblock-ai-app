import test from "node:test";
import assert from "node:assert/strict";
import { ApprovalController } from "../../src/controllers/approval.controller.js";
import { ApproverController } from "../../src/controllers/approver.controller.js";
import { TaskController } from "../../src/controllers/task.controller.js";
import { TaskFormController } from "../../src/controllers/task-form.controller.js";
import { createRequireTaskOwnership } from "../../src/middlewares/require-task-ownership.middleware.js";
import { ApproverAssignmentService } from "../../src/services/approver-assignment.service.js";
import { TaskService } from "../../src/services/task.service.js";
import { ApprovalErrorCode } from "../../src/data/constants/approval-error.constant.js";
import { AuthErrorCode } from "../../src/data/constants/auth.constant.js";
import { AUTHORIZATION_SCHEME } from "../../src/data/constants/auth.constant.js";
import { Permission } from "../../src/data/constants/permission.constant.js";
import { ApprovalChannel, ApprovalDecision, TaskCreationSource, TaskStatus } from "../../src/data/constants/task.constant.js";
import {
  createTestAuthentication,
  createTestControllers,
  startTestServer,
  TEST_USERS,
  TestIdentity,
  testUserRecord,
  type TestServer,
} from "../helpers/test-server.helper.js";
import { HttpMethod, readJson, sendJson } from "../helpers/http-request.helper.js";
import { IT_LEAVE_ID } from "../helpers/selection-testbed.helper.js";
import { createTaskTestbed, ENTRY_FORM_ID, leaveEntryValues, RecordingNotifier, type TaskTestbed } from "../helpers/task-testbed.helper.js";
import type {
  ApprovalAssignmentListResponseDto,
  ApprovalAssignmentSummaryDto,
  ApprovalDecisionResultDto,
  ApproverViewDto,
} from "../../src/lib/types/approval/approval.type.js";
import type { ErrorResponseBody } from "../../src/lib/types/http/http.type.js";
import type { ITaskNotifier } from "../../src/lib/types/task/task-notification.type.js";
import type { TaskDto } from "../../src/lib/types/task/task-dto.type.js";

const KAVINDU = TestIdentity.TASK_CREATOR;

enum Approver {
  ISHARA = "Ishara Bandara",
  DINESH = "Dinesh Wijesinghe",
  SUNETHRA = "Sunethra Ratnayake",
}

const APPROVER_EMAIL: Record<Approver, string> = {
  [Approver.ISHARA]: "u6@u.c",
  [Approver.DINESH]: "u19@u.c",
  [Approver.SUNETHRA]: "u18@u.c",
};

const APPROVER_TOKEN: Record<Approver, string> = {
  [Approver.ISHARA]: "test-session-token-ishara",
  [Approver.DINESH]: "test-session-token-dinesh",
  [Approver.SUNETHRA]: "test-session-token-sunethra",
};

interface Harness {
  server: TestServer;
  bed: TaskTestbed;
}

async function withServer(notifier: ITaskNotifier | null, run: (harness: Harness) => Promise<void>): Promise<void> {
  const bed = await createTaskTestbed({ userNames: new Map([[TEST_USERS[KAVINDU].id, "Kavindu Jayawardena"]]), notifier });
  const approvers = Object.values(Approver);
  const authentication = createTestAuthentication({
    users: approvers.map((name) => testUserRecord(bed.world.userIdOf(name), APPROVER_EMAIL[name], name, [Permission.TASK_CREATE, Permission.TASK_APPROVE])),
    sessions: approvers.map((name) => ({ userId: bed.world.userIdOf(name), token: APPROVER_TOKEN[name] })),
  });
  const serialization = { documentsEnabled: false, isDeletable: TaskService.isDeletable };
  const server = await startTestServer(
    createTestControllers({
      taskController: new TaskController({ taskService: bed.taskService, serialization, transcriptService: { renderForTask: async () => null } }),
      taskFormController: new TaskFormController({ taskFormService: bed.taskFormService, serialization }),
      approvalController: new ApprovalController({ approvalService: bed.approvalService }),
      approverController: new ApproverController({
        assignmentService: new ApproverAssignmentService({ taskModel: bed.taskModel }),
        approvalService: bed.approvalService,
      }),
    }),
    {
      authenticationService: authentication.authenticationService,
      routeGuards: { requireTaskOwnership: createRequireTaskOwnership({ taskService: bed.taskService }) },
    },
  );
  try {
    await run({ server, bed });
  } finally {
    await server.close();
  }
}

function asApprover(server: TestServer, approver: Approver, method: HttpMethod, path: string, body?: unknown): Promise<Response> {
  return fetch(`${server.baseUrl}/api${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Authorization: `${AUTHORIZATION_SCHEME} ${APPROVER_TOKEN[approver]}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function pending(server: TestServer, approver: Approver): Promise<ApprovalAssignmentListResponseDto> {
  return readJson(await asApprover(server, approver, HttpMethod.GET, "/approver/approvals/pending"));
}

async function history(server: TestServer, approver: Approver): Promise<ApprovalAssignmentListResponseDto> {
  return readJson(await asApprover(server, approver, HttpMethod.GET, "/approver/approvals/history"));
}

async function summary(server: TestServer, approver: Approver): Promise<number> {
  return (await readJson<ApprovalAssignmentSummaryDto>(await asApprover(server, approver, HttpMethod.GET, "/approver/approvals/summary"))).pending;
}

function decide(server: TestServer, approver: Approver, taskId: string, stepId: string, decision: ApprovalDecision, comment: string | null): Promise<Response> {
  return asApprover(server, approver, HttpMethod.POST, `/approver/approvals/${taskId}/steps/${stepId}/decision`, { decision, comment });
}

async function submittedTask(server: TestServer): Promise<TaskDto> {
  const created = await readJson<TaskDto>(
    await sendJson(server.baseUrl, HttpMethod.POST, "/tasks", KAVINDU, { source: TaskCreationSource.CATALOGUE, workflow_template_id: IT_LEAVE_ID }),
  );
  const values = { ...leaveEntryValues(), "assignees.advisor_review": { name: Approver.ISHARA, email: " U6@U.C " } };
  return readJson<TaskDto>(await sendJson(server.baseUrl, HttpMethod.POST, `/tasks/${created.id}/forms/${ENTRY_FORM_ID}/submit`, KAVINDU, { values }));
}

test("approver routes need a session and the task:approve permission", async () => {
  await withServer(null, async ({ server }) => {
    const anonymous = await sendJson(server.baseUrl, HttpMethod.GET, "/approver/approvals/pending", null);
    const requester = await sendJson(server.baseUrl, HttpMethod.GET, "/approver/approvals/pending", KAVINDU);

    assert.equal(anonymous.status, 401);
    assert.equal((await readJson<ErrorResponseBody>(anonymous)).code, AuthErrorCode.AUTHENTICATION_REQUIRED);
    assert.equal(requester.status, 403);
    assert.equal((await readJson<ErrorResponseBody>(requester)).code, AuthErrorCode.PERMISSION_DENIED);
  });
});

test("the whole approval story runs in the app with mail switched off", async () => {
  await withServer(null, async ({ server }) => {
    const task = await submittedTask(server);
    assert.equal(task.steps.find((step) => step.id === "advisor_review")?.assignee?.email, "u6@u.c");

    assert.equal(await summary(server, Approver.ISHARA), 1);
    const inbox = await pending(server, Approver.ISHARA);
    assert.deepEqual(inbox.approvals.map((row) => [row.task_id, row.step_id, row.requester.full_name, row.is_repeat]), [
      [task.id, "advisor_review", "Kavindu Jayawardena", false],
    ]);
    assert.equal(inbox.page.total, 1);

    const view = await readJson<ApproverViewDto>(await asApprover(server, Approver.ISHARA, HttpMethod.GET, `/approver/approvals/${task.id}/steps/advisor_review`));
    assert.equal(view.step.id, "advisor_review");
    assert.ok(view.allowed_decisions.includes(ApprovalDecision.REQUEST_MORE_INFO));
    assert.ok(view.sections.some((section) => section.fields.some((field) => field.value === "Japan")));

    const blocked = await decide(server, Approver.ISHARA, task.id, "advisor_review", ApprovalDecision.REQUEST_MORE_INFO, null);
    assert.equal(blocked.status, 400);
    assert.equal((await readJson<ErrorResponseBody>(blocked)).code, ApprovalErrorCode.APPROVAL_COMMENT_REQUIRED);

    const asked = await readJson<ApprovalDecisionResultDto>(
      await decide(server, Approver.ISHARA, task.id, "advisor_review", ApprovalDecision.REQUEST_MORE_INFO, "Please share the invitation letter"),
    );
    assert.equal(asked.next_step_name, "More information requested");
    assert.equal(await summary(server, Approver.ISHARA), 0);
    const firstHistory = await history(server, Approver.ISHARA);
    assert.deepEqual(firstHistory.approvals.map((row) => [row.decision, row.current_step_name, row.decided_via]), [
      [ApprovalDecision.REQUEST_MORE_INFO, "More information requested", ApprovalChannel.APP],
    ]);

    await sendJson(server.baseUrl, HttpMethod.POST, `/tasks/${task.id}/forms/advisor_review__information_request_1__form/submit`, KAVINDU, {
      values: { "responses.advisor_review__information_request_1": "Invited by Tokyo Tech" },
    });

    const repeat = await pending(server, Approver.ISHARA);
    assert.deepEqual(repeat.approvals.map((row) => [row.step_id, row.is_repeat]), [["advisor_review__repeat_1", true]]);
    assert.equal((await decide(server, Approver.ISHARA, task.id, "advisor_review__repeat_1", ApprovalDecision.APPROVED, null)).status, 200);
    assert.equal((await history(server, Approver.ISHARA)).page.total, 2);

    assert.deepEqual((await pending(server, Approver.DINESH)).approvals.map((row) => row.step_id), ["hod_review"]);
    assert.equal((await decide(server, Approver.DINESH, task.id, "hod_review", ApprovalDecision.APPROVED, null)).status, 200);

    assert.deepEqual((await pending(server, Approver.SUNETHRA)).approvals.map((row) => row.step_id), ["dean_review"]);
    const final = await readJson<ApprovalDecisionResultDto>(await decide(server, Approver.SUNETHRA, task.id, "dean_review", ApprovalDecision.APPROVED, "Approved"));
    assert.equal(final.task_status, TaskStatus.COMPLETED);

    const completed = await readJson<TaskDto>(await sendJson(server.baseUrl, HttpMethod.GET, `/tasks/${task.id}`, KAVINDU));
    assert.equal(completed.status, TaskStatus.COMPLETED);
    assert.ok(completed.steps.every((step) => step.approval === null || (!("decided_via" in step.approval) && !("decided_by_user_id" in step.approval))));
    const dinesh = await history(server, Approver.DINESH);
    assert.deepEqual(dinesh.approvals.map((row) => [row.task_status, row.current_step_name]), [[TaskStatus.COMPLETED, null]]);

    const again = await decide(server, Approver.SUNETHRA, task.id, "dean_review", ApprovalDecision.APPROVED, null);
    assert.equal(again.status, 409);
    assert.equal((await readJson<ErrorResponseBody>(again)).code, ApprovalErrorCode.APPROVAL_ALREADY_DECIDED);
  });
});

test("an approval belonging to someone else is not found", async () => {
  await withServer(null, async ({ server }) => {
    const task = await submittedTask(server);

    const response = await asApprover(server, Approver.DINESH, HttpMethod.GET, `/approver/approvals/${task.id}/steps/advisor_review`);

    assert.equal(response.status, 404);
    assert.equal((await readJson<ErrorResponseBody>(response)).code, ApprovalErrorCode.APPROVAL_NOT_FOUND);
  });
});

test("the emailed link still works next to the approver routes and shows an in-app decision", async () => {
  const notifier = new RecordingNotifier();
  await withServer(notifier, async ({ server }) => {
    const task = await submittedTask(server);
    const token = notifier.tokenFor("advisor_review");

    const before = await sendJson(server.baseUrl, HttpMethod.GET, `/approvals/${encodeURIComponent(token)}`, null);
    assert.equal(before.status, 200);
    assert.deepEqual((await readJson<ApproverViewDto>(before)).decided, null);

    assert.equal((await decide(server, Approver.ISHARA, task.id, "advisor_review", ApprovalDecision.APPROVED, null)).status, 200);

    const after = await readJson<ApproverViewDto>(await sendJson(server.baseUrl, HttpMethod.GET, `/approvals/${encodeURIComponent(token)}`, null));
    assert.equal(after.decided?.decision, ApprovalDecision.APPROVED);
    assert.deepEqual(after.allowed_decisions, []);
  });
});
