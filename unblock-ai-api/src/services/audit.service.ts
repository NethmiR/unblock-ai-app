import { AuditLogModel } from "../models/audit-log.model.js";
import { logger } from "../utils/shared/logger.util.js";
import type {
  AuditAction,
  AuditActor,
  AuditLogDocument,
  AuditResource,
} from "../lib/types/audit/audit.type.js";

export interface AuditServiceOptions {
  auditLogModel: AuditLogModel;
}

export interface RecordAuditInput {
  resource: AuditResource;
  resourceId: string;
  action: AuditAction;
  actor: AuditActor;
  /** Identifying fields of the row being removed - the log is all that survives it. */
  snapshot: Record<string, unknown>;
  reason?: string | null;
  requestId?: string | null;
}

/**
 * Writes the "who did what, when" trail for destructive actions.
 *
 * Callers write the entry BEFORE performing the delete. If the delete then
 * fails the log carries an attempt that did not land - which is recoverable by
 * reading it - whereas the reverse order can lose the record entirely.
 */
export class AuditService {
  private readonly auditLogModel: AuditLogModel;

  constructor({ auditLogModel }: AuditServiceOptions) {
    this.auditLogModel = auditLogModel;
  }

  async record(input: RecordAuditInput): Promise<AuditLogDocument> {
    const entry = await this.auditLogModel.insert({
      resource: input.resource,
      resource_id: input.resourceId,
      action: input.action,
      actor: input.actor,
      snapshot: input.snapshot,
      reason: input.reason ?? null,
      request_id: input.requestId ?? null,
      created_at: new Date(),
    });

    logger.info("audit entry recorded", {
      resource: input.resource,
      resourceId: input.resourceId,
      action: input.action,
      actorEmail: input.actor.email,
    });

    return entry;
  }

  list(resource: AuditResource, resourceId?: string): Promise<AuditLogDocument[]> {
    return this.auditLogModel.findByResource(resource, resourceId);
  }
}
