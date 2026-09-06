import { logger } from "../../utils/shared/logger.util.js";
import type { IMailer } from "./mailer.interface.js";
import type { MailMessage, MailSendResult } from "../../lib/types/approval/mail.type.js";
import type { MailConfig } from "../../lib/types/config/config.type.js";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

export interface BrevoMailerOptions {
  config: MailConfig;
}

export interface BrevoSender {
  name?: string;
  email: string;
}

// Parses the `Name <email>` format used everywhere else in this codebase
// (nodemailer's `from` string) into the {name, email} shape Brevo's API wants.
export function parseSender(from: string): BrevoSender {
  const match = from.match(/^(.*)<(.+)>\s*$/);
  if (!match) return { email: from.trim() };
  const name = match[1]?.trim();
  const email = match[2]?.trim() ?? "";
  return name ? { name, email } : { email };
}

export class BrevoMailer implements IMailer {
  private readonly apiKey: string;
  private readonly sender: BrevoSender;

  constructor({ config }: BrevoMailerOptions) {
    this.apiKey = config.brevoApiKey;
    this.sender = parseSender(config.from);
  }

  async send(message: MailMessage): Promise<MailSendResult> {
    try {
      const res = await fetch(BREVO_SEND_URL, {
        method: "POST",
        headers: {
          "api-key": this.apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: this.sender,
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html,
          attachment: message.attachments?.map((attachment) => ({
            name: attachment.filename,
            content: attachment.content.toString("base64"),
          })),
        }),
      });

      const body: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = extractBrevoError(body) ?? `Brevo API returned HTTP ${res.status}`;
        logger.error("brevo send failed", { to: message.to, subject: message.subject, status: res.status, error });
        return { sent: false, error, messageId: null };
      }

      const messageId = typeof (body as { messageId?: unknown })?.messageId === "string"
        ? (body as { messageId: string }).messageId
        : null;
      return { sent: true, error: null, messageId };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error("brevo send failed", { to: message.to, subject: message.subject, error });
      return { sent: false, error, messageId: null };
    }
  }
}

function extractBrevoError(body: unknown): string | null {
  if (body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string") {
    return (body as { message: string }).message;
  }
  return null;
}
