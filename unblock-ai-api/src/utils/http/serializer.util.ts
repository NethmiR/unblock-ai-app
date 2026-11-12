import type { TaskDocument, TaskDto } from "../../lib/types/task/task.type.js";

export function serializeTask(doc: TaskDocument): TaskDto {
  return {
    id: String(doc._id),
    reference: doc.reference,
    session_id: doc.session_id,
    created_by: doc.created_by,
    workflow_template_id: doc.workflow_template_id,
    workflow_template_version: doc.workflow_template_version,
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
