import { ConsoleMailer } from "./console.mailer.js";
import { BrevoMailer } from "./brevo.mailer.js";
import { ConfigurationError } from "../../errors/configuration.error.js";
import type { IMailer } from "./mailer.interface.js";
import type { MailConfig } from "../../lib/types/config/config.type.js";

export { ConsoleMailer } from "./console.mailer.js";
export { BrevoMailer } from "./brevo.mailer.js";
export type { IMailer } from "./mailer.interface.js";

export function createMailer(transport: MailConfig["transport"], config: MailConfig): IMailer {
  if (transport === "brevo") {
    return new BrevoMailer({ config });
  }
  if (transport === "console") {
    return new ConsoleMailer();
  }
  throw new ConfigurationError(`Unknown mail transport '${transport}'`);
}
