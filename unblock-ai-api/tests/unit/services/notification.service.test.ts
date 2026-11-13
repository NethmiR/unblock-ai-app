import test from "node:test";
import assert from "node:assert/strict";
import { NotificationService } from "../../../src/services/notification.service.js";
import { TaskEngineService } from "../../../src/services/task-engine.service.js";
import { ApprovalDecision } from "../../../src/data/constants/task.constant.js";
import { OrganisationalUnitType } from "../../../src/data/constants/organisational-unit.constant.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import { RecordingMailer } from "../../helpers/recording-mailer.helper.js";
import { buildTaskDocument, engineContext, leaveResolutions } from "../../helpers/task-fixture.helper.js";
import type { RenderedDocument } from "../../../src/lib/types/document/document.type.js";
import type { TaskDocument } from "../../../src/lib/types/task/task-document.type.js";

const LEAVE = loadExpectedFixture("it_faculty_overseas_leave.json");
const engine = new TaskEngineService();
const CONTEXT = engineContext(LEAVE);

function service(mailer: RecordingMailer, maxAttachmentBytes = 1_000_000): NotificationService {
  return new NotificationService({
    mailer,
    mailConfig: { appPublicUrl: "https://unblock.test" },
    documentConfig: { attachToEmail: true, maxAttachmentBytes },
  });
}

function dispatchedTask(): TaskDocument {
  let task = engine.start(buildTaskDocument(LEAVE, leaveResolutions()), CONTEXT).task;
  task = {
    ...task,
    requester: { ...task.requester, units: [{ id: "u", code: "IT", name: "Department of Information Technology", unit_type: OrganisationalUnitType.DEPARTMENT, parent_name: "Faculty of Information Technology", designation_titles: ["Student"] }] },
    values: {
      ...task.values,
      "inputs.departure_date": "2026-12-01",
      "inputs.return_date": "2026-12-10",
      "assignees.advisor_review": { user_id: null, name: "Dr Advisor", email: "advisor@u.c" },
    },
  };
  return engine.submitForm(task, "entry_form__form", CONTEXT).task;
}

function step(task: TaskDocument, id: string) {
  return task.steps.find((candidate) => candidate.id === id)!;
}

test("the approval request goes to the approver with the requester's details and a link", async () => {
  const mailer = new RecordingMailer();
  const task = dispatchedTask();

  assert.equal(await service(mailer).sendApprovalRequest(task, step(task, "advisor_review"), "tok.en"), true);

  const [mail] = mailer.sent;
  assert.equal(mail?.to, "advisor@u.c");
  assert.match(mail?.text ?? "", /Kavindu Jayawardena \(Department of Information Technology \(Faculty of Information Technology\) — Student\)/);
  assert.match(mail?.text ?? "", /Academic Advisor Review/);
  assert.match(mail?.text ?? "", /https:\/\/unblock\.test\/approvals\/tok\.en/);
  assert.doesNotMatch(mail?.text ?? "", /repeat review/);
});

test("a repeat review says so", async () => {
  const mailer = new RecordingMailer();
  let task = dispatchedTask();
  task = engine.recordDecision(task, "advisor_review", ApprovalDecision.REQUEST_MORE_INFO, "Which <institute>?", CONTEXT).task;

  await service(mailer).sendInformationRequested(task, step(task, "advisor_review__information_request_1"));
  await service(mailer).sendApprovalRequest(task, step(task, "advisor_review__repeat_1"), "t");

  assert.equal(mailer.sent[0]?.to, "u17@u.c");
  assert.match(mailer.sent[0]?.text ?? "", /Question: Which <institute>\?/);
  assert.match(mailer.sent[0]?.html ?? "", /Which &lt;institute&gt;\?/);
  assert.match(mailer.sent[0]?.text ?? "", /https:\/\/unblock\.test\/dashboard\/tasks\//);
  assert.match(mailer.sent[1]?.text ?? "", /repeat review/);
});

test("the rejection email names who rejected it and why", async () => {
  const mailer = new RecordingMailer();
  const task = engine.recordDecision(dispatchedTask(), "advisor_review", ApprovalDecision.REJECTED, "Exam clash", CONTEXT).task;

  await service(mailer).sendTaskRejected(task, step(task, "advisor_review"));

  assert.match(mailer.sent[0]?.text ?? "", /Dr Advisor rejected/);
  assert.match(mailer.sent[0]?.text ?? "", /Comment: Exam clash/);
});

test("the completion email attaches the transcript only within the size limit", async () => {
  const transcript: RenderedDocument = { buffer: Buffer.from("pdf"), filename: "T-transcript.pdf", contentType: "application/pdf", byteSize: 3, sha256: "x" };
  const small = new RecordingMailer();
  const large = new RecordingMailer();
  const task = dispatchedTask();

  await service(small).sendTaskCompleted(task, transcript);
  await service(large, 2).sendTaskCompleted(task, transcript);

  assert.equal(small.sent[0]?.attachments?.[0]?.filename, "T-transcript.pdf");
  assert.match(small.sent[0]?.text ?? "", /transcript of this request is attached/);
  assert.equal(large.sent[0]?.attachments, undefined);
});

test("a failed send reports false and never throws", async () => {
  const mailer = new RecordingMailer();
  mailer.failNext = true;
  const task = dispatchedTask();

  assert.equal(await service(mailer).sendRequesterActionRequired(task, step(task, "entry_form")), false);
});
