import { rawEnv } from "./env.config.js";
import { optionalString, parseEnum, parseNumber } from "../utils/shared/env-parse.util.js";
import { ConfigurationError } from "../errors/configuration.error.js";
import type { MailConfig } from "../lib/types/config/config.type.js";

const TRANSPORTS = ["console", "smtp"] as const;

export const mail: MailConfig = Object.freeze({
  transport: parseEnum("MAIL_TRANSPORT", rawEnv.MAIL_TRANSPORT, TRANSPORTS, "console"),
  from: optionalString("MAIL_FROM", rawEnv.MAIL_FROM, "Unblock AI <noreply@localhost>"),
  smtpHost: optionalString("SMTP_HOST", rawEnv.SMTP_HOST, ""),
  smtpPort: parseNumber("SMTP_PORT", rawEnv.SMTP_PORT, 587),
  smtpUser: optionalString("SMTP_USER", rawEnv.SMTP_USER, ""),
  smtpPass: optionalString("SMTP_PASS", rawEnv.SMTP_PASS, ""),
  appPublicUrl: optionalString("APP_PUBLIC_URL", rawEnv.APP_PUBLIC_URL, "http://localhost:3001"),
  tokenSecret: optionalString("APPROVAL_TOKEN_SECRET", rawEnv.APPROVAL_TOKEN_SECRET, ""),
  tokenTtlDays: parseNumber("APPROVAL_TOKEN_TTL_DAYS", rawEnv.APPROVAL_TOKEN_TTL_DAYS, 14),
});

if (mail.transport === "smtp" && mail.tokenSecret === "") {
  throw new ConfigurationError(
    "APPROVAL_TOKEN_SECRET is required when MAIL_TRANSPORT=smtp",
  );
}
