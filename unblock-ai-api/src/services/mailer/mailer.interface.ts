import type { MailMessage, MailSendResult } from "../../lib/types/approval/mail.type.js";

export interface IMailer {
  send(message: MailMessage): Promise<MailSendResult>;
}
