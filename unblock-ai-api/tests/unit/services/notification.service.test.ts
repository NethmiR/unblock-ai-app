import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { NotificationService } from "../../../src/services/notification.service.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import type { IMailer } from "../../../src/services/mailer/mailer.interface.js";
import type { MailMessage, MailSendResult } from "../../../src/lib/types/approval/mail.type.js";
import type { AppConfig } from "../../../src/lib/types/config/config.type.js";
import type { TaskDocument, TaskStepState } from "../../../src/lib/types/task/task.type.js";

const LEAVE_WORKFLOW = loadExpectedFixture("it_faculty_overseas_leave.json");

class FakeMailer implements IMailer {
  readonly sent: MailMessage[] = [];
  private readonly result: MailSendResult;
  private readonly shouldThrow: boolean;

  constructor(options: { result?: MailSendResult; shouldThrow?: boolean } = {}) {
    this.result = options.result ?? { sent: true, error: null };
    this.shouldThrow = options.shouldThrow ?? false;
  }

  send(message: MailMessage): Promise<MailSendResult> {
    if (this.shouldThrow) return Promise.reject(new Error("smtp exploded"));
    this.sent.push(message);
    return Promise.resolve(this.result);
  }
}

const FAKE_CONFIG = { mail: { appPublicUrl: "https://unblock.example" } } as unknown as AppConfig;

function baseTask(overrides: Partial<TaskDocument> = {}): TaskDocument {
  const now = new Date();
  return {
    _id: new ObjectId(),
    reference: "TASK-2026-00042",
    session_id: "session-1",
    workflow_id: LEAVE_WORKFLOW.workflow_id,
    version: 1,
    status: "in_progress",
    requirements: [],
    values: {},
    steps: [],
    audit: [],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function advisorStep(overrides: Partial<TaskStepState> = {}): TaskStepState {
  return {
    step_id: "advisor_review",
    name: "Academic Advisor Review",
    type: "approval",
    depends_on: [],
    state: "pending_approval",
    assignee: { name: "Dr. Advisor", email: "advisor@example.com" },
    outcome: null,
    reason: null,
    responded_at: null,
    approval_token: "abc123.signature",
    token_expires_at: null,
    token_used_at: null,
    notified_at: null,
    reopen_count: 0,
    ...overrides,
  };
}

test("sendApprovalRequest emails the assignee with the token URL and step name", async () => {
  const mailer = new FakeMailer();
  const service = new NotificationService({ mailer, config: FAKE_CONFIG });
  const task = baseTask();
  const step = advisorStep();

  const result = await service.sendApprovalRequest(task, LEAVE_WORKFLOW, step);

  assert.equal(result, true);
  assert.equal(mailer.sent.length, 1);
  assert.equal(mailer.sent[0]!.to, "advisor@example.com");
  assert.match(mailer.sent[0]!.text, /https:\/\/unblock\.example\/approvals\/abc123\.signature/);
  assert.match(mailer.sent[0]!.text, /Academic Advisor Review/);
});

test("sendApprovalRequest returns false without sending when the step has no assignee", async () => {
  const mailer = new FakeMailer();
  const service = new NotificationService({ mailer, config: FAKE_CONFIG });
  const task = baseTask();
  const step = advisorStep({ assignee: null });

  const result = await service.sendApprovalRequest(task, LEAVE_WORKFLOW, step);

  assert.equal(result, false);
  assert.equal(mailer.sent.length, 0);
});

test("sendRejectionNotice contains the reason text verbatim", async () => {
  const mailer = new FakeMailer();
  const service = new NotificationService({ mailer, config: FAKE_CONFIG });
  const task = baseTask({
    requirements: [
      {
        key: "requester_email",
        source: "input",
        ref: "requester_email",
        label: "Email",
        description: null,
        type: "email",
        required: true,
        validation: null,
        collection_hint: null,
        status: "filled",
      },
    ],
    values: { requester_email: "student@example.com" },
  });
  const step = advisorStep({
    state: "rejected",
    outcome: "rejected",
    reason: "Cannot approve leave 12–20 Aug — final exams are scheduled that week.",
  });

  const result = await service.sendRejectionNotice(task, LEAVE_WORKFLOW, step);

  assert.equal(result, true);
  assert.equal(mailer.sent[0]!.to, "student@example.com");
  assert.match(
    mailer.sent[0]!.text,
    /Cannot approve leave 12–20 Aug — final exams are scheduled that week\./,
  );
});

test("requester-facing notices no-op when no email-typed requirement is filled", async () => {
  const mailer = new FakeMailer();
  const service = new NotificationService({ mailer, config: FAKE_CONFIG });
  const task = baseTask();

  const rejected = await service.sendRejectionNotice(task, LEAVE_WORKFLOW, advisorStep({ outcome: "rejected" }));
  const completed = await service.sendCompletionNotice(task, LEAVE_WORKFLOW);
  const moreInfo = await service.sendMoreInfoNotice(task, LEAVE_WORKFLOW, advisorStep());

  assert.equal(rejected, false);
  assert.equal(completed, false);
  assert.equal(moreInfo, false);
  assert.equal(mailer.sent.length, 0);
});

test("a mailer that throws returns false and does not propagate", async () => {
  const mailer = new FakeMailer({ shouldThrow: true });
  const service = new NotificationService({ mailer, config: FAKE_CONFIG });
  const task = baseTask();
  const step = advisorStep();

  const result = await service.sendApprovalRequest(task, LEAVE_WORKFLOW, step);

  assert.equal(result, false);
});

test("a mailer that resolves sent: false is reported as a failed send", async () => {
  const mailer = new FakeMailer({ result: { sent: false, error: "rejected by relay" } });
  const service = new NotificationService({ mailer, config: FAKE_CONFIG });
  const task = baseTask();
  const step = advisorStep();

  const result = await service.sendApprovalRequest(task, LEAVE_WORKFLOW, step);

  assert.equal(result, false);
});
