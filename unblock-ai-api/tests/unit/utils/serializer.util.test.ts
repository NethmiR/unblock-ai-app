import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import {
  serializeDraft,
  serializeTemplateSummary,
  serializeTemplateRecord,
} from "../../../src/utils/http/serializer.util.js";
import type { DraftDocument } from "../../../src/lib/types/draft/draft.type.js";
import type { TemplateDocument } from "../../../src/lib/types/template/template.type.js";

function draftDoc(overrides: Partial<DraftDocument> = {}): DraftDocument {
  return {
    _id: new ObjectId(),
    raw_text: "raw",
    text_sha256: "hash",
    title: null,
    submitted_by: null,
    status: "pending",
    failure_reason: null,
    workflow_id: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function templateDoc(overrides: Partial<TemplateDocument> = {}): TemplateDocument {
  return {
    _id: new ObjectId(),
    workflow_id: "wf_1",
    version: 1,
    draft_id: null,
    title: "Title",
    description: "Description",
    institution_type: null,
    schema_version: "1.0",
    review_status: "confirmed",
    document: {} as TemplateDocument["document"],
    is_latest: true,
    retrieval: { text: "", embedding: [], aliases_lower: [], model: "m", dim: 1, embedded_at: "" },
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

test("serializeDraft converts _id to a string id", () => {
  const doc = draftDoc();
  const dto = serializeDraft(doc);
  assert.equal(dto.id, String(doc._id));
  assert.equal(typeof dto.id, "string");
});

test("serializeDraft preserves the raw_text and status fields", () => {
  const dto = serializeDraft(draftDoc({ status: "extracted", raw_text: "hello" }));
  assert.equal(dto.status, "extracted");
  assert.equal(dto.raw_text, "hello");
});

test("serializeTemplateSummary converts draft_id ObjectId to string", () => {
  const draftId = new ObjectId();
  const dto = serializeTemplateSummary(templateDoc({ draft_id: draftId }));
  assert.equal(dto.draft_id, String(draftId));
});

test("serializeTemplateSummary keeps draft_id null when absent", () => {
  const dto = serializeTemplateSummary(templateDoc({ draft_id: null }));
  assert.equal(dto.draft_id, null);
});

test("serializeTemplateSummary renders updated_at as an ISO string", () => {
  const dto = serializeTemplateSummary(templateDoc({ updated_at: new Date("2026-03-05T12:00:00.000Z") }));
  assert.equal(dto.updated_at, "2026-03-05T12:00:00.000Z");
});

test("serializeTemplateRecord passes through the full document and draft_id as a string", () => {
  const draftId = new ObjectId();
  const doc = templateDoc({ draft_id: draftId, document: { workflow_id: "wf_1" } as TemplateDocument["document"] });
  const dto = serializeTemplateRecord(doc);
  assert.equal(dto.draft_id, String(draftId));
  assert.deepEqual(dto.document, { workflow_id: "wf_1" });
});
