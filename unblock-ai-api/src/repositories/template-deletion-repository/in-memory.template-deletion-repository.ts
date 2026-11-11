import type { ITemplateDeletionRepository } from "./template-deletion-repository.interface.js";
import type {
  TemplateDeletionInput,
  TemplateDeletionRecord,
} from "../../lib/types/template-deletion/template-deletion.type.js";

export interface InMemoryTemplateDeletionRepositoryOptions {
  deletions?: TemplateDeletionRecord[];
}

export class InMemoryTemplateDeletionRepository implements ITemplateDeletionRepository {
  private readonly deletions: TemplateDeletionRecord[];
  private nextId: number;

  constructor({ deletions = [] }: InMemoryTemplateDeletionRepositoryOptions = {}) {
    this.deletions = deletions.map((deletion) => ({ ...deletion }));
    this.nextId = this.deletions.length + 1;
  }

  async record(input: TemplateDeletionInput): Promise<TemplateDeletionRecord> {
    const record: TemplateDeletionRecord = {
      id: String(this.nextId++),
      workflow_id: input.workflowId,
      template_title: input.templateTitle,
      latest_version: input.latestVersion,
      versions_removed: 0,
      institution_type: input.institutionType,
      review_status: input.reviewStatus,
      deleted_by_user_id: input.deletedByUserId,
      deleted_by_email: input.deletedByEmail,
      reason: input.reason,
      request_id: input.requestId,
      snapshot: input.snapshot,
      deleted_at: new Date(),
    };
    this.deletions.push(record);
    return { ...record };
  }

  async markCompleted(id: string, versionsRemoved: number): Promise<void> {
    const record = this.deletions.find((deletion) => deletion.id === id);
    if (record) record.versions_removed = versionsRemoved;
  }

  async list(limit: number, workflowId?: string): Promise<TemplateDeletionRecord[]> {
    const filtered = workflowId
      ? this.deletions.filter((deletion) => deletion.workflow_id === workflowId)
      : this.deletions;
    return filtered
      .slice()
      .sort((a, b) => b.deleted_at.getTime() - a.deleted_at.getTime())
      .slice(0, limit)
      .map((deletion) => ({ ...deletion }));
  }
}
