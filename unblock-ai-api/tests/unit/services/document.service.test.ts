import test from "node:test";
import assert from "node:assert/strict";
import { TextDocumentRenderer } from "../../../src/services/document/text.document.js";
import { PdfDocumentRenderer } from "../../../src/services/document/pdf.document.js";
import { createDocumentRenderer } from "../../../src/services/document/index.document.js";
import { ConfigurationError } from "../../../src/errors/configuration.error.js";
import type { CompletionDocument } from "../../../src/lib/types/document/document.type.js";

function buildDocument(overrides: Partial<CompletionDocument> = {}): CompletionDocument {
  return {
    reference: "LEAVE-2026-00001",
    workflow_title: "Overseas Leave Request",
    workflow_description: "Leave request for overseas travel.",
    institution_name: "Test University",
    submitted_at: new Date("2026-01-01T00:00:00Z"),
    completed_at: new Date("2026-01-05T00:00:00Z"),
    sections: [
      {
        title: "Request details",
        fields: [
          { label: "Full Name", value: "Alex Perera" },
          { label: "Destination Country", value: "Singapore" },
        ],
      },
    ],
    approvals: [
      {
        step_name: "Academic Advisor Review",
        designation: "Academic Advisor",
        name: "Jane Doe",
        email: "jane@example.edu",
        outcome: "Approved",
        decided_at: new Date("2026-01-03T00:00:00Z"),
        reason: null,
      },
    ],
    ...overrides,
  };
}

test("text renderer emits sections and approvals in order, with the full approver block", async () => {
  const renderer = new TextDocumentRenderer();
  const rendered = await renderer.render(buildDocument());
  const text = rendered.buffer.toString("utf8");

  const requestDetailsIndex = text.indexOf("REQUEST DETAILS");
  const approvalsIndex = text.indexOf("APPROVALS");
  assert.ok(requestDetailsIndex >= 0 && approvalsIndex > requestDetailsIndex);

  assert.match(text, /Academic Advisor Review/);
  assert.match(text, /Designation: Academic Advisor/);
  assert.match(text, /Name: Jane Doe/);
  assert.match(text, /Email address: jane@example\.edu/);

  assert.equal(rendered.contentType, "text/plain");
  assert.equal(rendered.filename, "LEAVE-2026-00001-record.txt");
});

test("text renderer only emits approval rows it was given", async () => {
  const renderer = new TextDocumentRenderer();
  const rendered = await renderer.render(buildDocument({ approvals: [] }));
  const text = rendered.buffer.toString("utf8");

  assert.doesNotMatch(text, /Academic Advisor Review/);
});

test("pdf renderer produces a valid PDF buffer", async () => {
  const renderer = new PdfDocumentRenderer();
  const rendered = await renderer.render(buildDocument());

  assert.equal(rendered.buffer.subarray(0, 5).toString("utf8"), "%PDF-");
  assert.ok(rendered.byteSize > 0);
  assert.equal(rendered.contentType, "application/pdf");
  assert.equal(rendered.filename, "LEAVE-2026-00001-record.pdf");
});

test("rendering the same CompletionDocument twice yields the same sha256", async () => {
  const renderer = new PdfDocumentRenderer();
  const document = buildDocument();

  const first = await renderer.render(document);
  const second = await renderer.render(document);

  assert.equal(first.sha256, second.sha256);
});

test("an oversized free-text value paginates instead of overflowing", async () => {
  const renderer = new PdfDocumentRenderer();
  const longValue = "This is a very long answer. ".repeat(400);
  const rendered = await renderer.render(
    buildDocument({
      sections: [{ title: "Request details", fields: [{ label: "Notes", value: longValue }] }],
    }),
  );

  const pdfText = rendered.buffer.toString("latin1");
  const pageObjectCount = (pdfText.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  assert.ok(pageObjectCount > 1, "expected more than one page object in the PDF");
});

test("createDocumentRenderer returns a PdfDocumentRenderer for 'pdf'", () => {
  assert.ok(createDocumentRenderer("pdf") instanceof PdfDocumentRenderer);
});

test("createDocumentRenderer returns a TextDocumentRenderer for 'text'", () => {
  assert.ok(createDocumentRenderer("text") instanceof TextDocumentRenderer);
});

test("createDocumentRenderer throws ConfigurationError for an unknown format", () => {
  assert.throws(
    () => createDocumentRenderer("html" as unknown as "pdf"),
    ConfigurationError,
  );
});
