import { TRANSCRIPT_COPY } from "../../data/constants/transcript.constant.js";
import { formatDocumentDate, transcriptFileName } from "../../utils/document/document-format.util.js";
import { sha256Buffer } from "../../utils/shared/hash.util.js";
import type { IDocumentRenderer } from "./document.interface.js";
import type { DocumentField, RenderedDocument, TaskTranscript } from "../../lib/types/document/document.type.js";

const TEXT_EXTENSION = "txt";
const TEXT_CONTENT_TYPE = "text/plain";
const INDENT = "  ";

function fieldLines(fields: readonly DocumentField[]): string[] {
  return fields.map((field) => `${INDENT}${field.label}: ${field.value || TRANSCRIPT_COPY.EMPTY}`);
}

function section(title: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : ["", title.toUpperCase(), ...lines];
}

// Plain-text mirror of PdfDocumentRenderer with the same sections and content, so transcript
// content can be asserted on in tests without parsing a PDF.
export class TextDocumentRenderer implements IDocumentRenderer {
  render(transcript: TaskTranscript): Promise<RenderedDocument> {
    const lines: string[] = [
      transcript.title,
      `${TRANSCRIPT_COPY.REFERENCE}: ${transcript.reference}`,
      `${TRANSCRIPT_COPY.STATUS}: ${TRANSCRIPT_COPY.STATUS_COMPLETED}`,
      `${TRANSCRIPT_COPY.SUBMITTED}: ${formatDocumentDate(transcript.submitted_at)}`,
      `${TRANSCRIPT_COPY.COMPLETED}: ${formatDocumentDate(transcript.completed_at)}`,
      ...section(TRANSCRIPT_COPY.REQUESTER, fieldLines(transcript.requester)),
      ...section(TRANSCRIPT_COPY.CONVERSATION, transcript.conversation.map((text) => `${INDENT}${text}`)),
      ...transcript.sections.flatMap((entry) => section(entry.title, fieldLines(entry.fields))),
      ...section(
        TRANSCRIPT_COPY.INFORMATION_REQUESTS,
        transcript.information_exchanges.flatMap((exchange) => [
          `${INDENT}${TRANSCRIPT_COPY.ASKED_BY}: ${exchange.asked_by ?? TRANSCRIPT_COPY.EMPTY}`,
          `${INDENT}${TRANSCRIPT_COPY.QUESTION}: ${exchange.question}`,
          `${INDENT}${TRANSCRIPT_COPY.ANSWER}: ${exchange.answer ?? TRANSCRIPT_COPY.EMPTY}`,
        ]),
      ),
      ...section(
        TRANSCRIPT_COPY.APPROVALS,
        transcript.approvals.flatMap((row) => [
          `${INDENT}${row.step_name}`,
          `${INDENT}${INDENT}${TRANSCRIPT_COPY.APPROVER}: ${row.approver_name ?? TRANSCRIPT_COPY.EMPTY}`,
          `${INDENT}${INDENT}${TRANSCRIPT_COPY.DESIGNATION}: ${row.designation ?? TRANSCRIPT_COPY.EMPTY}`,
          `${INDENT}${INDENT}${TRANSCRIPT_COPY.DECISION}: ${row.decision}${row.decided_at ? ` (${formatDocumentDate(row.decided_at)})` : ""}`,
          ...(row.comment ? [`${INDENT}${INDENT}${TRANSCRIPT_COPY.COMMENT}: ${row.comment}`] : []),
        ]),
      ),
      ...section(TRANSCRIPT_COPY.SKIPPED_STEPS, transcript.skipped_steps.map((name) => `${INDENT}${name}: ${TRANSCRIPT_COPY.NOT_REQUIRED}`)),
      ...section(TRANSCRIPT_COPY.COMPUTED, fieldLines(transcript.computed)),
      "",
      `${transcript.reference}${TRANSCRIPT_COPY.SECTION_SEPARATOR}${TRANSCRIPT_COPY.FOOTER}${TRANSCRIPT_COPY.SECTION_SEPARATOR}${transcript.institution_name}`,
    ];

    const buffer = Buffer.from(lines.join("\n"), "utf8");
    return Promise.resolve({
      buffer,
      filename: transcriptFileName(transcript.reference, TEXT_EXTENSION),
      contentType: TEXT_CONTENT_TYPE,
      byteSize: buffer.byteLength,
      sha256: sha256Buffer(buffer),
    });
  }
}
