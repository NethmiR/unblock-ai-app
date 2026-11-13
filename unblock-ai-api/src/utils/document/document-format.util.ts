import { TRANSCRIPT_FILE_SUFFIX } from "../../data/constants/transcript.constant.js";

// ISO-based, not toLocaleString: the renderer must produce byte-identical output for the
// same transcript, and locale-dependent formatting varies across environments.
export function formatDocumentDate(date: Date): string {
  return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

export function transcriptFileName(reference: string, extension: string): string {
  return `${reference}${TRANSCRIPT_FILE_SUFFIX}.${extension}`;
}
