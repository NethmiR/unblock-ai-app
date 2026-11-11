import { query } from "../../db/postgres.client.js";
import type { ITemplateDeletionRepository } from "./template-deletion-repository.interface.js";
import type {
  TemplateDeletionInput,
  TemplateDeletionRecord,
} from "../../lib/types/template-deletion/template-deletion.type.js";

const TEMPLATE_DELETION_COLUMNS = `id, workflow_id, template_title, latest_version, versions_removed,
          institution_type, review_status, deleted_by_user_id, deleted_by_email,
          reason, request_id, snapshot, deleted_at`;

export class PostgresTemplateDeletionRepository implements ITemplateDeletionRepository {
  async record(input: TemplateDeletionInput): Promise<TemplateDeletionRecord> {
    const rows = await query<TemplateDeletionRecord>(
      `INSERT INTO template_deletions
         (workflow_id, template_title, latest_version, institution_type, review_status,
          deleted_by_user_id, deleted_by_email, reason, request_id, snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${TEMPLATE_DELETION_COLUMNS}`,
      [
        input.workflowId,
        input.templateTitle,
        input.latestVersion,
        input.institutionType,
        input.reviewStatus,
        input.deletedByUserId,
        input.deletedByEmail,
        input.reason,
        input.requestId,
        JSON.stringify(input.snapshot),
      ],
    );
    return rows[0]!;
  }

  async markCompleted(id: string, versionsRemoved: number): Promise<void> {
    await query("UPDATE template_deletions SET versions_removed = $2 WHERE id = $1", [id, versionsRemoved]);
  }

  async list(limit: number, workflowId?: string): Promise<TemplateDeletionRecord[]> {
    if (workflowId) {
      return query<TemplateDeletionRecord>(
        `SELECT ${TEMPLATE_DELETION_COLUMNS} FROM template_deletions
          WHERE workflow_id = $1 ORDER BY deleted_at DESC LIMIT $2`,
        [workflowId, limit],
      );
    }
    return query<TemplateDeletionRecord>(
      `SELECT ${TEMPLATE_DELETION_COLUMNS} FROM template_deletions ORDER BY deleted_at DESC LIMIT $1`,
      [limit],
    );
  }
}
