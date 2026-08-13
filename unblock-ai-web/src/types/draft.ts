export type DraftStatus = "pending" | "extracted" | "failed" | "rejected";

export interface Draft {
  id: string;
  title: string | null;
  raw_text: string;
  status: DraftStatus;
  failure_reason: string | null;
  workflow_id: string | null;
  created_at: string;
  updated_at: string;
}
