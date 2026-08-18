import { createMailer } from "../src/services/mailer/index.mailer.js";
import { config } from "../src/config/index.config.js";

async function smokeTest(): Promise<void> {
  const to = process.argv[2];
  if (!to) {
    throw new Error("Usage: npm run smoke-test:mail -- <recipient-email>");
  }

  const mailer = createMailer(config.mail.transport, config.mail);
  const result = await mailer.send({
    to,
    subject: "Unblock AI — SMTP smoke test",
    text: "If you can read this, MAIL_TRANSPORT=smtp is wired up correctly.",
    html: "<p>If you can read this, <code>MAIL_TRANSPORT=smtp</code> is wired up correctly.</p>",
  });

  if (!result.sent) {
    throw new Error(result.error ?? "send returned sent: false");
  }
}

try {
  await smokeTest();
  console.log(`Mail transport OK — sent via ${config.mail.transport}`);
} catch (err) {
  console.error("Mail transport failed:", (err as Error).message);
  process.exitCode = 1;
}
