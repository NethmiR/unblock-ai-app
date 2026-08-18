import { ConfigurationError } from "../../errors/configuration.error.js";
import type { IMailer } from "./mailer.interface.js";
import type { MailMessage, MailSendResult } from "../../lib/types/approval/mail.type.js";
import type { MailConfig } from "../../lib/types/config/config.type.js";

export interface SmtpMailerOptions {
  config: MailConfig;
}

// Real transport wiring (nodemailer) lands in Phase 5. This stub keeps `IMailer`
// satisfied so `createMailer` can select "smtp" without the dependency existing yet.
export class SmtpMailer implements IMailer {
  constructor(_options: SmtpMailerOptions) {}

  send(_message: MailMessage): Promise<MailSendResult> {
    throw new ConfigurationError("SMTP transport is not yet implemented");
  }
}
