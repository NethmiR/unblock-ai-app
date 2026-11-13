import PDFDocument from "pdfkit";
import { TRANSCRIPT_COPY } from "../../data/constants/transcript.constant.js";
import { approvalTable, footer, heading, labelValueRow, paragraph, sectionTitle } from "../../utils/document/pdf-layout.util.js";
import { transcriptFileName } from "../../utils/document/document-format.util.js";
import { sha256Buffer } from "../../utils/shared/hash.util.js";
import type { IDocumentRenderer } from "./document.interface.js";
import type { DocumentField, RenderedDocument, TaskTranscript } from "../../lib/types/document/document.type.js";

type PDFDoc = PDFKit.PDFDocument;

const PDF_EXTENSION = "pdf";
const PDF_CONTENT_TYPE = "application/pdf";
const SECTION_GAP = 0.6;

function fieldSection(pdf: PDFDoc, title: string, fields: readonly DocumentField[]): void {
  if (fields.length === 0) return;
  sectionTitle(pdf, title);
  for (const field of fields) labelValueRow(pdf, field);
  pdf.moveDown(SECTION_GAP);
}

export class PdfDocumentRenderer implements IDocumentRenderer {
  render(transcript: TaskTranscript): Promise<RenderedDocument> {
    const pdf = new PDFDocument({
      size: "A4",
      margin: 50,
      bufferPages: true,
      info: {
        Title: `${transcript.reference}${TRANSCRIPT_COPY.SECTION_SEPARATOR}${transcript.title}`,
        Author: transcript.institution_name,
        CreationDate: transcript.completed_at,
      },
    });

    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve, reject) => {
      pdf.on("end", () => resolve(Buffer.concat(chunks)));
      pdf.on("error", reject);
    });

    heading(pdf, transcript);
    fieldSection(pdf, TRANSCRIPT_COPY.REQUESTER, transcript.requester);

    if (transcript.conversation.length > 0) {
      sectionTitle(pdf, TRANSCRIPT_COPY.CONVERSATION);
      for (const text of transcript.conversation) paragraph(pdf, text);
      pdf.moveDown(SECTION_GAP);
    }

    for (const section of transcript.sections) fieldSection(pdf, section.title, section.fields);

    for (const exchange of transcript.information_exchanges) {
      fieldSection(pdf, TRANSCRIPT_COPY.INFORMATION_REQUESTS, [
        { label: TRANSCRIPT_COPY.ASKED_BY, value: exchange.asked_by ?? TRANSCRIPT_COPY.EMPTY },
        { label: TRANSCRIPT_COPY.QUESTION, value: exchange.question },
        { label: TRANSCRIPT_COPY.ANSWER, value: exchange.answer ?? TRANSCRIPT_COPY.EMPTY },
      ]);
    }

    if (transcript.approvals.length > 0) {
      sectionTitle(pdf, TRANSCRIPT_COPY.APPROVALS);
      approvalTable(pdf, transcript.approvals);
      pdf.moveDown(SECTION_GAP);
    }

    fieldSection(
      pdf,
      TRANSCRIPT_COPY.SKIPPED_STEPS,
      transcript.skipped_steps.map((name) => ({ label: name, value: TRANSCRIPT_COPY.NOT_REQUIRED })),
    );
    fieldSection(pdf, TRANSCRIPT_COPY.COMPUTED, transcript.computed);

    footer(pdf, transcript.reference, transcript.institution_name);
    pdf.end();

    return finished.then((buffer) => ({
      buffer,
      filename: transcriptFileName(transcript.reference, PDF_EXTENSION),
      contentType: PDF_CONTENT_TYPE,
      byteSize: buffer.byteLength,
      sha256: sha256Buffer(buffer),
    }));
  }
}
