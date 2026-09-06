import test from "node:test";
import assert from "node:assert/strict";
import { ConsoleMailer } from "../../../src/services/mailer/console.mailer.js";
import { BrevoMailer, parseSender } from "../../../src/services/mailer/brevo.mailer.js";
import type { MailMessage } from "../../../src/lib/types/approval/mail.type.js";
import type { MailConfig } from "../../../src/lib/types/config/config.type.js";

const FAKE_CONFIG: MailConfig = {
  transport: "brevo",
  from: "Unblock AI <noreply@unblock.example>",
  brevoApiKey: "fake-api-key",
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

test("BrevoMailer posts attachments as base64 to the Brevo API", async () => {
  const mailer = new BrevoMailer({ config: FAKE_CONFIG });
  const message = messageWithAttachment();
  const originalFetch = global.fetch;
  let receivedUrl: string | undefined;
  let receivedInit: RequestInit | undefined;
  global.fetch = ((url: string, init?: RequestInit) => {
    receivedUrl = url;
    receivedInit = init;
    return Promise.resolve(new Response(JSON.stringify({ messageId: "<abc@brevo>" }), { status: 201 }));
  }) as typeof fetch;

  try {
    const result = await mailer.send(message);

    assert.equal(result.sent, true);
    assert.equal(result.messageId, "<abc@brevo>");
    assert.equal(receivedUrl, "https://api.brevo.com/v3/smtp/email");
    assert.equal((receivedInit?.headers as Record<string, string>)["api-key"], "fake-api-key");

    const body = JSON.parse(receivedInit?.body as string);
    assert.deepEqual(body.sender, { name: "Unblock AI", email: "noreply@unblock.example" });
    assert.equal(body.attachment[0].name, "UNB-2026-000481-record.pdf");
    assert.equal(body.attachment[0].content, message.attachments![0]!.content.toString("base64"));
  } finally {
    global.fetch = originalFetch;
  }
});

test("BrevoMailer surfaces the Brevo error message on a non-2xx response", async () => {
  const mailer = new BrevoMailer({ config: FAKE_CONFIG });
  const originalFetch = global.fetch;
  global.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ message: "Key not found" }), { status: 401 }))) as typeof fetch;

  try {
    const result = await mailer.send(messageWithAttachment());
    assert.equal(result.sent, false);
    assert.equal(result.error, "Key not found");
  } finally {
    global.fetch = originalFetch;
  }
});

test("parseSender splits 'Name <email>' into Brevo's {name, email} shape", () => {
  assert.deepEqual(parseSender("Unblock AI <noreply@unblock.example>"), {
    name: "Unblock AI",
    email: "noreply@unblock.example",
  });
  assert.deepEqual(parseSender("noreply@unblock.example"), { email: "noreply@unblock.example" });
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
