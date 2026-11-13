import test from "node:test";
import assert from "node:assert/strict";
import { ApprovalController } from "../../src/controllers/approval.controller.js";
import { TaskController } from "../../src/controllers/task.controller.js";
import { TaskFormController } from "../../src/controllers/task-form.controller.js";
import { createRequireTaskOwnership } from "../../src/middlewares/require-task-ownership.middleware.js";
import { NotificationService } from "../../src/services/notification.service.js";
import { PdfDocumentRenderer } from "../../src/services/document/pdf.document.js";
import { TaskService } from "../../src/services/task.service.js";
import { TaskTranscriptService } from "../../src/services/task-transcript.service.js";
import { ApprovalErrorCode } from "../../src/data/constants/approval-error.constant.js";
import { TaskErrorCode } from "../../src/data/constants/task-error.constant.js";
import { ApprovalDecision, TaskCreationSource, TaskStatus, TaskStepStatus } from "../../src/data/constants/task.constant.js";
import { createTestAuthentication, createTestControllers, startTestServer, TEST_USERS, TestIdentity, type TestServer } from "../helpers/test-server.helper.js";
import { HttpMethod, readJson, sendJson } from "../helpers/http-request.helper.js";
import { RecordingMailer } from "../helpers/recording-mailer.helper.js";
import { IT_LEAVE_ID, SELECTION_TEMPLATES } from "../helpers/selection-testbed.helper.js";
import { createTaskTestbed, ENTRY_FORM_ID, leaveEntryValues, TEST_MAIL_CONFIG, type TaskTestbed } from "../helpers/task-testbed.helper.js";
import type { ApprovalDecisionResultDto, ApproverViewDto } from "../../src/lib/types/approval/approval.type.js";
import type { ErrorResponseBody } from "../../src/lib/types/http/http.type.js";
import type { TaskDto } from "../../src/lib/types/task/task-dto.type.js";

const KAVINDU = TestIdentity.TASK_CREATOR;
const ADVISOR_EMAIL = "advisor@u.c";

interface Harness {
  server: TestServer;
  bed: TaskTestbed;
  mailer: RecordingMailer;
  clock: { now: Date };
}

async function withServer(run: (harness: Harness) => Promise<void>): Promise<void> {
  const mailer = new RecordingMailer();
  const clock = { now: new Date("2026-11-13T09:00:00Z") };
  const workflowTemplateService = {
    getDefinition: async (id: string) => SELECTION_TEMPLATES.find((template) => template.id === id)!.definition(),
  };
  const transcriptService = new TaskTranscriptService({
    renderer: new PdfDocumentRenderer(),
    documentConfig: { enabled: true, institutionName: "University of Moratuwa" },
    workflowTemplateService,
  });
  const notifier = new NotificationService({
    mailer,
    mailConfig: TEST_MAIL_CONFIG,
    documentConfig: { attachToEmail: true, maxAttachmentBytes: 5_000_000 },
  });
  const bed = await createTaskTestbed({
    userNames: new Map([[TEST_USERS[KAVINDU].id, "Kavindu Jayawardena"]]),
    notifier,
    transcriptRenderer: transcriptService,
    now: () => clock.now,
  });
  const serialization = { documentsEnabled: true, isDeletable: TaskService.isDeletable };
  const server = await startTestServer(
    createTestControllers({
      taskController: new TaskController({ taskService: bed.taskService, serialization, transcriptService }),
      taskFormController: new TaskFormController({ taskFormService: bed.taskFormService, serialization }),
      approvalController: new ApprovalController({ approvalService: bed.approvalService }),
    }),
    {
      authenticationService: createTestAuthentication().authenticationService,
      routeGuards: { requireTaskOwnership: createRequireTaskOwnership({ taskService: bed.taskService }) },
    },
  );
  try {
    await run({ server, bed, mailer, clock });
  } finally {
    await server.close();
  }
}

async function submittedTask(server: TestServer): Promise<TaskDto> {
  const created = await readJson<TaskDto>(
    await sendJson(server.baseUrl, HttpMethod.POST, "/tasks", KAVINDU, { source: TaskCreationSource.CATALOGUE, workflow_template_id: IT_LEAVE_ID }),
  );
  return readJson<TaskDto>(
    await sendJson(server.baseUrl, HttpMethod.POST, `/tasks/${created.id}/forms/${ENTRY_FORM_ID}/submit`, KAVINDU, { values: leaveEntryValues() }),
  );
}

function decide(server: TestServer, token: string, decision: ApprovalDecision, comment: string | null): Promise<Response> {
  return sendJson(server.baseUrl, HttpMethod.POST, `/approvals/${encodeURIComponent(token)}/decision`, null, { decision, comment });
}

test("the full approval journey through HTTP ends with a downloadable transcript", async () => {
  await withServer(async ({ server, mailer }) => {
    const task = await submittedTask(server);
    const advisorToken = mailer.lastApprovalToken(ADVISOR_EMAIL);

    const view = await readJson<ApproverViewDto>(await sendJson(server.baseUrl, HttpMethod.GET, `/approvals/${encodeURIComponent(advisorToken)}`, null));
    assert.equal(view.step.id, "advisor_review");
    assert.equal(view.task.requester.full_name, "Kavindu Jayawardena");
    assert.ok(view.allowed_decisions.includes(ApprovalDecision.REQUEST_MORE_INFO));
    assert.ok(view.sections.some((section) => section.fields.some((field) => field.value === "Japan")));

    const blocked = await decide(server, advisorToken, ApprovalDecision.REQUEST_MORE_INFO, null);
    assert.equal(blocked.status, 400);
    assert.equal((await readJson<ErrorResponseBody>(blocked)).code, ApprovalErrorCode.APPROVAL_COMMENT_REQUIRED);

    const asked = await readJson<ApprovalDecisionResultDto>(await decide(server, advisorToken, ApprovalDecision.REQUEST_MORE_INFO, "Please share the invitation letter details"));
    assert.equal(asked.next_step_name, "More information requested");
    assert.match(mailer.sent.at(-1)?.text ?? "", /Please share the invitation letter details/);

    const answered = await readJson<TaskDto>(
      await sendJson(server.baseUrl, HttpMethod.POST, `/tasks/${task.id}/forms/advisor_review__information_request_1__form/submit`, KAVINDU, {
        values: { "responses.advisor_review__information_request_1": "Invited by Tokyo Tech" },
      }),
    );
    assert.equal(answered.steps.find((step) => step.id === "advisor_review__repeat_1")?.status, TaskStepStatus.AWAITING_APPROVER);

    const repeatToken = mailer.lastApprovalToken(ADVISOR_EMAIL);
    assert.notEqual(repeatToken, advisorToken);
    assert.equal((await decide(server, repeatToken, ApprovalDecision.APPROVED, null)).status, 200);
    assert.equal((await decide(server, mailer.lastApprovalToken("u19@u.c"), ApprovalDecision.APPROVED, null)).status, 200);
    const final = await readJson<ApprovalDecisionResultDto>(await decide(server, mailer.lastApprovalToken("u18@u.c"), ApprovalDecision.APPROVED, "Approved"));
    assert.equal(final.task_status, TaskStatus.COMPLETED);

    const completionMail = mailer.sent.at(-1);
    assert.equal(completionMail?.to, "u17@u.c");
    assert.equal(completionMail?.attachments?.[0]?.contentType, "application/pdf");

    const done = await readJson<TaskDto>(await sendJson(server.baseUrl, HttpMethod.GET, `/tasks/${task.id}`, KAVINDU));
    assert.equal(done.status, TaskStatus.COMPLETED);
    assert.equal(done.available_actions.can_download_transcript, true);

    const transcript = await sendJson(server.baseUrl, HttpMethod.GET, `/tasks/${task.id}/transcript`, KAVINDU);
    assert.equal(transcript.status, 200);
    assert.equal(transcript.headers.get("content-type"), "application/pdf");
    assert.match(transcript.headers.get("content-disposition") ?? "", /transcript\.pdf/);
    assert.equal(Buffer.from(await transcript.arrayBuffer()).subarray(0, 5).toString("utf8"), "%PDF-");
  });
});

test("an expired link returns 410 and a reused link returns 409", async () => {
  await withServer(async ({ server, mailer, clock }) => {
    await submittedTask(server);
    const token = mailer.lastApprovalToken(ADVISOR_EMAIL);

    assert.equal((await decide(server, token, ApprovalDecision.APPROVED, null)).status, 200);
    const reused = await decide(server, token, ApprovalDecision.APPROVED, null);
    assert.equal(reused.status, 409);
    assert.equal((await readJson<ErrorResponseBody>(reused)).code, ApprovalErrorCode.APPROVAL_ALREADY_DECIDED);
    const decidedView = await readJson<ApproverViewDto>(await sendJson(server.baseUrl, HttpMethod.GET, `/approvals/${encodeURIComponent(token)}`, null));
    assert.equal(decidedView.decided?.decision, ApprovalDecision.APPROVED);

    clock.now = new Date("2027-02-01T09:00:00Z");
    const hodToken = mailer.lastApprovalToken("u19@u.c");
    const expired = await decide(server, hodToken, ApprovalDecision.APPROVED, null);
    assert.equal(expired.status, 410);
    assert.equal((await readJson<ErrorResponseBody>(expired)).code, ApprovalErrorCode.APPROVAL_LINK_EXPIRED);
  });
});

test("the transcript is unavailable until the task is completed", async () => {
  await withServer(async ({ server }) => {
    const task = await submittedTask(server);

    const response = await sendJson(server.baseUrl, HttpMethod.GET, `/tasks/${task.id}/transcript`, KAVINDU);

    assert.equal(response.status, 409);
    assert.equal((await readJson<ErrorResponseBody>(response)).code, TaskErrorCode.TASK_TRANSCRIPT_UNAVAILABLE);
  });
});

test("an unknown approval link returns 404", async () => {
  await withServer(async ({ server }) => {
    assert.equal((await sendJson(server.baseUrl, HttpMethod.GET, "/approvals/not-a-token", null)).status, 404);
  });
});
