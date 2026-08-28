export interface DocumentField {
  label: string;
  value: string;
}

export interface DocumentSection {
  title: string;
  fields: DocumentField[];
}

export interface ApprovalRow {
  step_name: string;
  designation: string;
  name: string | null;
  email: string | null;
  outcome: string;
  decided_at: Date | null;
  reason: string | null;
}

export interface CompletionDocument {
  reference: string;
  workflow_title: string;
  workflow_description: string;
  institution_name: string;
  submitted_at: Date;
  completed_at: Date;
  sections: DocumentSection[];
  approvals: ApprovalRow[];
}

export interface RenderedDocument {
  buffer: Buffer;
  filename: string;
  contentType: string;
  byteSize: number;
  sha256: string;
}

/**
 * Persisted on the task, not the bytes - a completed task is immutable and its
 * workflow is version-pinned, so the document can be regenerated deterministically
 * from `generated_at` on demand instead of stored in full.
 */
export interface CompletionDocumentRecord {
  generated_at: Date;
  filename: string;
  byte_size: number;
  sha256: string;
  emailed_to: string | null;
  emailed_at: Date | null;
}
