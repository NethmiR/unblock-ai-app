export interface TemplateDeletionInput {
  workflowId: string;
  templateTitle: string;
  latestVersion: number;
  institutionType: string | null;
  reviewStatus: string | null;
  deletedByUserId: string;
  deletedByEmail: string;
  reason: string | null;
  requestId: string | null;
  snapshot: Record<string, unknown>;
}

export interface TemplateDeletionRecord {
  id: string;
  workflow_id: string;
  template_title: string;
  latest_version: number;
  versions_removed: number;
  institution_type: string | null;
  review_status: string | null;
  deleted_by_user_id: string;
  deleted_by_email: string;
  reason: string | null;
  request_id: string | null;
  snapshot: Record<string, unknown>;
  deleted_at: Date;
}
