export interface DocumentField {
  label: string;
  value: string;
}

export interface DocumentSection {
  title: string;
  fields: DocumentField[];
}

export interface TranscriptApprovalRow {
  step_name: string;
  approver_name: string | null;
  designation: string | null;
  decision: string;
  comment: string | null;
  decided_at: Date | null;
}

export interface TranscriptInformationExchange {
  asked_by: string | null;
  question: string;
  answer: string | null;
  asked_at: Date | null;
  answered_at: Date | null;
}

export interface TaskTranscript {
  reference: string;
  title: string;
  description: string;
  institution_name: string;
  submitted_at: Date;
  completed_at: Date;
  requester: DocumentField[];
  conversation: string[];
  sections: DocumentSection[];
  information_exchanges: TranscriptInformationExchange[];
  approvals: TranscriptApprovalRow[];
  skipped_steps: string[];
  computed: DocumentField[];
}

export interface RenderedDocument {
  buffer: Buffer;
  filename: string;
  contentType: string;
  byteSize: number;
  sha256: string;
}
