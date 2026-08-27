import type { IAuthStore } from "./auth-store/auth-store.interface.js";
import type { TemplateDeletionRecord } from "../lib/types/auth/auth.type.js";

export interface DeletionLogServiceOptions {
  authStore: IAuthStore;
}

export interface RecordDeletionInput {
  workflowId: string;
  templateTitle: string;
  latestVersion: number;
  institutionType: string | null;
  reviewStatus: string | null;
  adminId: string;
  adminUsername: string;
  reason?: string | null;
  requestId?: string | null;
  snapshot: Record<string, unknown>;
}

/**
 * Thin service over the deletion half of `IAuthStore` (D-2: template
 * deletions are Postgres, not the Mongo `audit_logs` collection - see
 * Finding 0.2). Kept separate from `AuditService`, which still owns task
 * deletions, so the two audit trails do not get tangled together.
 */
export class DeletionLogService {
  private readonly authStore: IAuthStore;

  constructor({ authStore }: DeletionLogServiceOptions) {
    this.authStore = authStore;
  }

  record(input: RecordDeletionInput): Promise<TemplateDeletionRecord> {
    return this.authStore.recordTemplateDeletion({
      workflow_id: input.workflowId,
      template_title: input.templateTitle,
      latest_version: input.latestVersion,
      institution_type: input.institutionType,
      review_status: input.reviewStatus,
      admin_id: input.adminId,
      admin_username: input.adminUsername,
      reason: input.reason ?? null,
      request_id: input.requestId ?? null,
      snapshot: input.snapshot,
    });
  }

  markCompleted(id: string, versionsRemoved: number): Promise<void> {
    return this.authStore.markDeletionCompleted(id, versionsRemoved);
  }

  list(limit: number, workflowId?: string): Promise<TemplateDeletionRecord[]> {
    return this.authStore.listTemplateDeletions(limit, workflowId);
  }
}
