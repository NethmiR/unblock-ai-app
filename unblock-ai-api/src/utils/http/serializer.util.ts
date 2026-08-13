import type { DraftDocument, DraftDto } from "../../lib/types/draft/draft.type.js";
import type { TemplateDocument, TemplateRecordDto, TemplateSummary } from "../../lib/types/template/template.type.js";

export function serializeDraft(doc: DraftDocument): DraftDto {
  return {
    id: String(doc._id),
    title: doc.title,
    raw_text: doc.raw_text,
    status: doc.status,
    failure_reason: doc.failure_reason,
    workflow_id: doc.workflow_id,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };
}

export function serializeTemplateSummary(doc: TemplateDocument): TemplateSummary {
  return {
    workflow_id: doc.workflow_id,
    title: doc.title,
    description: doc.description,
    version: doc.version,
    schema_version: doc.schema_version,
    review_status: doc.review_status,
    draft_id: doc.draft_id ? String(doc.draft_id) : null,
    updated_at: (doc.updated_at as unknown as { toISOString?: () => string })?.toISOString?.() ?? (doc.updated_at as unknown as string),
  };
}

export function serializeTemplateRecord(doc: TemplateDocument): TemplateRecordDto {
  return {
    workflow_id: doc.workflow_id,
    version: doc.version,
    draft_id: doc.draft_id ? String(doc.draft_id) : null,
    review_status: doc.review_status,
    document: doc.document,
    updated_at: doc.updated_at,
  };
}
