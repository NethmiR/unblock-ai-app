import test from "node:test";
import assert from "node:assert/strict";
import { ConsoleMailer } from "../../../src/services/mailer/console.mailer.js";
import { SmtpMailer } from "../../../src/services/mailer/smtp.mailer.js";
import type { MailMessage } from "../../../src/lib/types/approval/mail.type.js";
import type { MailConfig } from "../../../src/lib/types/config/config.type.js";

const FAKE_CONFIG: MailConfig = {
  transport: "smtp",
  from: "noreply@unblock.example",
  smtpHost: "localhost",
  smtpPort: 587,
  smtpUser: "",
  smtpPass: "",
  appPublicUrl: "https://unblock.example",
  tokenSecret: "secret",
  tokenTtlDays: 7,
};

function messageWithAttachment(): MailMessage {
  return {
    to: "requester@example.com",
    subject: "Request approved",
    text: "Your request has been approved.",
    html: "<p>Your request has been approved.</p>",
    attachments: [
      {
        filename: "UNB-2026-000481-record.pdf",
        content: Buffer.from("%PDF-1.4 fake content for test purposes"),
        contentType: "application/pdf",
      },
    ],
  };
}

test("FakeMailer records the attachment array passed to send()", async () => {
  const message = messageWithAttachment();
  const sent: MailMessage[] = [];
  const fakeMailer = { send: (m: MailMessage) => (sent.push(m), Promise.resolve({ sent: true, error: null })) };

  await fakeMailer.send(message);

  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.attachments?.length, 1);
  assert.equal(sent[0]!.attachments?.[0]!.filename, "UNB-2026-000481-record.pdf");
});

test("SmtpMailer forwards attachments to the underlying transporter", async () => {
  const mailer = new SmtpMailer({ config: FAKE_CONFIG });
  const message = messageWithAttachment();
  let received: unknown;
  (mailer as unknown as { transporter: { sendMail: (opts: unknown) => Promise<unknown> } }).transporter.sendMail = (
    opts: unknown,
  ) => {
    received = opts;
    return Promise.resolve();
  };

  const result = await mailer.send(message);

  assert.equal(result.sent, true);
  assert.deepEqual((received as { attachments?: unknown }).attachments, message.attachments);
});

test("ConsoleMailer logs attachment metadata, never the buffer content", async () => {
  const mailer = new ConsoleMailer();
  const message = messageWithAttachment();
  const originalLog = console.log;
  let loggedLine = "";
  console.log = (line: string) => {
    loggedLine = line;
  };

  try {
    const result = await mailer.send(message);
    assert.equal(result.sent, true);
  } finally {
    console.log = originalLog;
  }

  assert.match(loggedLine, /UNB-2026-000481-record\.pdf/);
  assert.match(loggedLine, /"byteSize":\d+/);
  assert.doesNotMatch(loggedLine, /%PDF-1\.4 fake content/);
});
