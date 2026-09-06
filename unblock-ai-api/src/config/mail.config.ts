import { rawEnv } from "./env.config.js";
import { optionalString, parseEnum, parseNumber } from "../utils/shared/env-parse.util.js";
import { ConfigurationError } from "../errors/configuration.error.js";
import type { MailConfig } from "../lib/types/config/config.type.js";

const TRANSPORTS = ["console", "brevo"] as const;

export const mail: MailConfig = Object.freeze({
  transport: parseEnum("MAIL_TRANSPORT", rawEnv.MAIL_TRANSPORT, TRANSPORTS, "console"),
  from: optionalString("MAIL_FROM", rawEnv.MAIL_FROM, "Unblock AI <noreply@localhost>"),
  brevoApiKey: optionalString("BREVO_API_KEY", rawEnv.BREVO_API_KEY, ""),
  appPublicUrl: optionalString("APP_PUBLIC_URL", rawEnv.APP_PUBLIC_URL, "http://localhost:3001"),
  tokenSecret: optionalString("APPROVAL_TOKEN_SECRET", rawEnv.APPROVAL_TOKEN_SECRET, ""),
  tokenTtlDays: parseNumber("APPROVAL_TOKEN_TTL_DAYS", rawEnv.APPROVAL_TOKEN_TTL_DAYS, 14),
});

if (mail.transport === "brevo" && mail.tokenSecret === "") {
  throw new ConfigurationError(
    "APPROVAL_TOKEN_SECRET is required when MAIL_TRANSPORT=brevo",
  );
}
if (mail.transport === "brevo" && mail.brevoApiKey === "") {
  throw new ConfigurationError(
    "BREVO_API_KEY is required when MAIL_TRANSPORT=brevo",
  );
}
