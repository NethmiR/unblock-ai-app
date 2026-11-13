import { formatDocumentDate } from "./document-format.util.js";
import { TRANSCRIPT_COPY } from "../../data/constants/transcript.constant.js";
import type { DocumentField, TaskTranscript, TranscriptApprovalRow } from "../../lib/types/document/document.type.js";

type PDFDoc = PDFKit.PDFDocument;

const APPROVAL_COLUMNS = [
  { key: "step", label: "Step", width: 140 },
  { key: "approver", label: "Approver", width: 110 },
  { key: "decision", label: "Decision", width: 90 },
  { key: "comment", label: "Comment", width: 155 },
] as const;

const CELL_PADDING = 4;
const ROW_PADDING = 6;
const LINE_BREAK = "\n";

function contentBottom(doc: PDFDoc): number {
  return doc.page.height - doc.page.margins.bottom;
}

function ensureSpace(doc: PDFDoc, height: number): void {
  if (doc.y + height > contentBottom(doc)) {
    doc.addPage();
  }
}

export function heading(doc: PDFDoc, transcript: TaskTranscript): number {
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#000000").text(transcript.title);
  doc.moveDown(0.4);

  doc.font("Helvetica").fontSize(10).fillColor("#444444");
  doc.text(`${TRANSCRIPT_COPY.REFERENCE}: ${transcript.reference}`);
  doc.text(`${TRANSCRIPT_COPY.STATUS}: ${TRANSCRIPT_COPY.STATUS_COMPLETED}`);
  doc.text(`${TRANSCRIPT_COPY.SUBMITTED}: ${formatDocumentDate(transcript.submitted_at)}`);
  doc.text(`${TRANSCRIPT_COPY.COMPLETED}: ${formatDocumentDate(transcript.completed_at)}`);
  doc.fillColor("#000000");
  doc.moveDown(1);

  return doc.y;
}

export function sectionTitle(doc: PDFDoc, title: string): number {
  ensureSpace(doc, 26);
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#000000").text(title);
  doc.moveDown(0.4);
  return doc.y;
}

export function paragraph(doc: PDFDoc, text: string): number {
  doc.font("Helvetica").fontSize(10).fillColor("#000000");
  ensureSpace(doc, doc.heightOfString(text) + ROW_PADDING);
  doc.text(text);
  doc.moveDown(0.3);
  return doc.y;
}

export function labelValueRow(doc: PDFDoc, field: DocumentField): number {
  const left = doc.page.margins.left;
  const labelWidth = 170;
  const gap = 10;
  const valueWidth = doc.page.width - doc.page.margins.right - (left + labelWidth + gap);
  const value = field.value || TRANSCRIPT_COPY.EMPTY;

  doc.font("Helvetica-Bold").fontSize(10);
  const labelHeight = doc.heightOfString(field.label, { width: labelWidth });
  doc.font("Helvetica").fontSize(10);
  const valueHeight = doc.heightOfString(value, { width: valueWidth });
  const rowHeight = Math.max(labelHeight, valueHeight) + ROW_PADDING;

  ensureSpace(doc, rowHeight);
  const y = doc.y;

  doc.font("Helvetica-Bold").fontSize(10).text(field.label, left, y, { width: labelWidth });
  doc.font("Helvetica").fontSize(10).text(value, left + labelWidth + gap, y, { width: valueWidth });

  doc.y = y + rowHeight;
  return doc.y;
}

function decisionText(row: TranscriptApprovalRow): string {
  return row.decided_at ? [row.decision, formatDocumentDate(row.decided_at)].join(LINE_BREAK) : row.decision;
}

function approvalRowCells(row: TranscriptApprovalRow): Record<(typeof APPROVAL_COLUMNS)[number]["key"], string> {
  return {
    step: row.step_name,
    approver: [row.approver_name ?? TRANSCRIPT_COPY.EMPTY, row.designation ?? TRANSCRIPT_COPY.EMPTY].join(LINE_BREAK),
    decision: decisionText(row),
    comment: row.comment ?? TRANSCRIPT_COPY.EMPTY,
  };
}

function drawApprovalTableHeader(doc: PDFDoc): void {
  ensureSpace(doc, 20);
  const y = doc.y;
  let x = doc.page.margins.left;

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000");
  for (const column of APPROVAL_COLUMNS) {
    doc.text(column.label, x + CELL_PADDING, y, { width: column.width - CELL_PADDING * 2 });
    x += column.width;
  }

  doc.y = y + 16;
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor("#cccccc")
    .stroke();
  doc.moveDown(0.3);
}

export function approvalTable(doc: PDFDoc, approvals: readonly TranscriptApprovalRow[]): number {
  if (approvals.length === 0) return doc.y;

  drawApprovalTableHeader(doc);

  for (const row of approvals) {
    const cells = approvalRowCells(row);
    doc.font("Helvetica").fontSize(9);
    const cellHeight = Math.max(
      ...APPROVAL_COLUMNS.map((column) => doc.heightOfString(cells[column.key], { width: column.width - CELL_PADDING * 2 })),
    );
    const rowHeight = cellHeight + ROW_PADDING;

    ensureSpace(doc, rowHeight);
    const y = doc.y;
    let x = doc.page.margins.left;

    doc.font("Helvetica").fontSize(9).fillColor("#000000");
    for (const column of APPROVAL_COLUMNS) {
      doc.text(cells[column.key], x + CELL_PADDING, y, { width: column.width - CELL_PADDING * 2 });
      x += column.width;
    }

    doc.y = y + rowHeight;
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor("#eeeeee")
      .stroke();
    doc.moveDown(0.2);
  }

  return doc.y;
}

export function footer(doc: PDFDoc, reference: string, institutionName: string): void {
  const range = doc.bufferedPageRange();
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const label = [reference, TRANSCRIPT_COPY.FOOTER, institutionName].join(TRANSCRIPT_COPY.SECTION_SEPARATOR);

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);

    // Writing inside the bottom margin would otherwise make pdfkit think the content
    // overflows the page and silently insert a fresh page for it. Widen the writable area
    // for this one write, then restore it.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - bottomMargin + 16;

    doc.font("Helvetica").fontSize(8).fillColor("#666666");
    doc.text(label, doc.page.margins.left, y, { width, align: "left", lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, doc.page.margins.left, y, { width, align: "right", lineBreak: false });

    doc.page.margins.bottom = bottomMargin;
  }

  doc.fillColor("#000000");
}
