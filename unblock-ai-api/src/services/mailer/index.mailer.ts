import { ConsoleMailer } from "./console.mailer.js";
import { SmtpMailer } from "./smtp.mailer.js";
import { ConfigurationError } from "../../errors/configuration.error.js";
import type { IMailer } from "./mailer.interface.js";
import type { MailConfig } from "../../lib/types/config/config.type.js";

export { ConsoleMailer } from "./console.mailer.js";
export { SmtpMailer } from "./smtp.mailer.js";
export type { IMailer } from "./mailer.interface.js";

export function createMailer(transport: MailConfig["transport"], config: MailConfig): IMailer {
  if (transport === "smtp") {
    return new SmtpMailer({ config });
  }
  if (transport === "console") {
    return new ConsoleMailer();
  }
  throw new ConfigurationError(`Unknown mail transport '${transport}'`);
}
