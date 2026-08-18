import { logger } from "../../utils/shared/logger.util.js";
import type { IMailer } from "./mailer.interface.js";
import type { MailMessage, MailSendResult } from "../../lib/types/approval/mail.type.js";

// Prints the email to stdout instead of sending it, so the entire approval chain is
// clickable from the terminal with no provider account.
export class ConsoleMailer implements IMailer {
  send(message: MailMessage): Promise<MailSendResult> {
    logger.info("mail (console transport)", {
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return Promise.resolve({ sent: true, error: null });
  }
}
