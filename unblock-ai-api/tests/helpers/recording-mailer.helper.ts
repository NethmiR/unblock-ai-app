import type { IMailer } from "../../src/services/mailer/mailer.interface.js";
import type { MailMessage, MailSendResult } from "../../src/lib/types/approval/mail.type.js";

const APPROVAL_LINK = /\/approvals\/([^\s"<]+)/;

export class RecordingMailer implements IMailer {
  readonly sent: MailMessage[] = [];
  failNext = false;

  send(message: MailMessage): Promise<MailSendResult> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.resolve({ sent: false, error: "simulated failure" });
    }
    this.sent.push(message);
    return Promise.resolve({ sent: true, error: null });
  }

  lastApprovalToken(to?: string): string {
    const message = [...this.sent].reverse().find((candidate) => (to === undefined || candidate.to === to) && APPROVAL_LINK.test(candidate.text));
    const match = message?.text.match(APPROVAL_LINK);
    if (!match?.[1]) throw new Error(`No approval link was emailed${to ? ` to ${to}` : ""}`);
    return decodeURIComponent(match[1]);
  }
}
