import type { ObjectId } from "mongodb";

export type DraftStatus = "pending" | "extracted" | "failed" | "rejected";

export interface DraftDocument {
  _id: ObjectId;
  raw_text: string;
  text_sha256: string;
  title: string | null;
  submitted_by: string | null;
  status: DraftStatus;
  failure_reason: string | null;
  workflow_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DraftDto {
  id: string;
  title: string | null;
  raw_text: string;
  status: DraftStatus;
  failure_reason: string | null;
  workflow_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDraftInput {
  rawText: string;
  title?: string | null;
  submittedBy?: string | null;
}
