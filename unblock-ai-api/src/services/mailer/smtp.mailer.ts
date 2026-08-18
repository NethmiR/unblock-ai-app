import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "../../utils/shared/logger.util.js";
import type { IMailer } from "./mailer.interface.js";
import type { MailMessage, MailSendResult } from "../../lib/types/approval/mail.type.js";
import type { MailConfig } from "../../lib/types/config/config.type.js";

export interface SmtpMailerOptions {
  config: MailConfig;
}

export class SmtpMailer implements IMailer {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor({ config }: SmtpMailerOptions) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
    });
  }

  async send(message: MailMessage): Promise<MailSendResult> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { sent: true, error: null };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error("smtp send failed", { to: message.to, subject: message.subject, error });
      return { sent: false, error };
    }
  }
}
