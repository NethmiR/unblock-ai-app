import type { DraftDocument, DraftDto } from "../../lib/types/draft/draft.type.js";
import type { TemplateDocument, TemplateRecordDto, TemplateSummary } from "../../lib/types/template/template.type.js";
import type { TaskDocument, TaskDto } from "../../lib/types/task/task.type.js";

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

export function serializeTask(doc: TaskDocument): TaskDto {
  return {
    id: String(doc._id),
    reference: doc.reference,
    session_id: doc.session_id,
    workflow_id: doc.workflow_id,
    version: doc.version,
    status: doc.status,
    requirements: doc.requirements,
    values: doc.values,
    steps: doc.steps,
    audit: doc.audit,
    completion_document: doc.completion_document,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };
}

export function serializeTaskSummary(doc: TaskDocument): TaskDto {
  return serializeTask(doc);
}

export function serializeTemplateRecord(doc: TemplateDocument, draftText?: string | null): TemplateRecordDto {
  return {
    workflow_id: doc.workflow_id,
    version: doc.version,
    draft_id: doc.draft_id ? String(doc.draft_id) : null,
    review_status: doc.review_status,
    document: doc.document,
    updated_at: doc.updated_at,
    draft_text: draftText ?? null,
  };
}
