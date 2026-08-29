import { rawEnv } from "./env.config.js";
import { optionalString, parseBoolean, parseEnum, parseNumber } from "../utils/shared/env-parse.util.js";
import type { DocumentConfig } from "../lib/types/config/config.type.js";

const FORMATS = ["pdf", "text"] as const;

export const document: DocumentConfig = Object.freeze({
  enabled: parseBoolean("DOCUMENT_ENABLED", rawEnv.DOCUMENT_ENABLED, true),
  attachToEmail: parseBoolean("DOCUMENT_ATTACH_TO_EMAIL", rawEnv.DOCUMENT_ATTACH_TO_EMAIL, true),
  format: parseEnum("DOCUMENT_FORMAT", rawEnv.DOCUMENT_FORMAT, FORMATS, "pdf"),
  institutionName: optionalString("DOCUMENT_INSTITUTION_NAME", rawEnv.DOCUMENT_INSTITUTION_NAME, "Unblock AI"),
  maxAttachmentBytes: parseNumber("DOCUMENT_MAX_ATTACHMENT_BYTES", rawEnv.DOCUMENT_MAX_ATTACHMENT_BYTES, 5_000_000),
});
