import { formatDocumentDate } from "../../utils/document/document-format.util.js";
import { sha256Buffer } from "../../utils/shared/hash.util.js";
import type { IDocumentRenderer } from "./document.interface.js";
import type { CompletionDocument, RenderedDocument } from "../../lib/types/document/document.type.js";

// Plain-text mirror of PdfDocumentRenderer, same section order and content. Exists so
// document content (ordering, labels, the approver block) can be asserted on in tests
// without parsing a PDF, exactly as ConsoleMailer lets the approval chain be tested
// without SMTP.
export class TextDocumentRenderer implements IDocumentRenderer {
  render(doc: CompletionDocument): Promise<RenderedDocument> {
    const lines: string[] = [];

    lines.push(doc.workflow_title);
    lines.push(`Task reference: ${doc.reference}`);
    lines.push(`Status: Approved`);
    lines.push(`Submitted: ${formatDocumentDate(doc.submitted_at)}`);
    lines.push(`Completed: ${formatDocumentDate(doc.completed_at)}`);

    for (const section of doc.sections) {
      lines.push("");
      lines.push(section.title.toUpperCase());
      for (const field of section.fields) {
        lines.push(`  ${field.label}: ${field.value}`);
      }
    }

    lines.push("");
    lines.push("APPROVALS");
    for (const row of doc.approvals) {
      lines.push(`  ${row.step_name}`);
      lines.push(`    Designation: ${row.designation}`);
      lines.push(`    Name: ${row.name ?? "—"}`);
      lines.push(`    Email address: ${row.email ?? "—"}`);
      lines.push(
        `    Decision: ${row.outcome}${row.decided_at ? ` (${formatDocumentDate(row.decided_at)})` : ""}`,
      );
      if (row.reason) lines.push(`    Note: ${row.reason}`);
    }

    lines.push("");
    lines.push(`${doc.reference} — System-generated record — ${doc.institution_name}`);

    const buffer = Buffer.from(lines.join("\n"), "utf8");

    return Promise.resolve({
      buffer,
      filename: `${doc.reference}-record.txt`,
      contentType: "text/plain",
      byteSize: buffer.byteLength,
      sha256: sha256Buffer(buffer),
    });
  }
}
