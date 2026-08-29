import PDFDocument from "pdfkit";
import { approvalTable, footer, heading, labelValueRow, sectionTitle } from "../../utils/document/pdf-layout.util.js";
import { sha256Buffer } from "../../utils/shared/hash.util.js";
import type { IDocumentRenderer } from "./document.interface.js";
import type { CompletionDocument, RenderedDocument } from "../../lib/types/document/document.type.js";

export class PdfDocumentRenderer implements IDocumentRenderer {
  render(doc: CompletionDocument): Promise<RenderedDocument> {
    const pdf = new PDFDocument({
      size: "A4",
      margin: 50,
      bufferPages: true,
      info: {
        Title: `${doc.reference} — Completion Record`,
        Author: doc.institution_name,
        CreationDate: doc.completed_at,
      },
    });

    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));

    const finished = new Promise<Buffer>((resolve, reject) => {
      pdf.on("end", () => resolve(Buffer.concat(chunks)));
      pdf.on("error", reject);
    });

    heading(pdf, doc);

    for (const section of doc.sections) {
      sectionTitle(pdf, section.title);
      for (const field of section.fields) {
        labelValueRow(pdf, field);
      }
      pdf.moveDown(0.6);
    }

    sectionTitle(pdf, "Approvals");
    approvalTable(pdf, doc.approvals);

    footer(pdf, doc.reference, doc.institution_name);
    pdf.end();

    return finished.then((buffer) => ({
      buffer,
      filename: `${doc.reference}-record.pdf`,
      contentType: "application/pdf",
      byteSize: buffer.byteLength,
      sha256: sha256Buffer(buffer),
    }));
  }
}
