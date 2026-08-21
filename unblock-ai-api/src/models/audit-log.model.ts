import type { Collection } from "mongodb";
import { getCollection } from "../db/mongo.client.js";
import { COLLECTIONS } from "../data/constants/collection.constant.js";
import { DatabaseError } from "../errors/database.error.js";
import type { AuditLogDocument, AuditResource } from "../lib/types/audit/audit.type.js";

/**
 * Append-only log of destructive actions.
 *
 * Deliberately has no update or delete method: the whole point of this
 * collection is that it outlives the rows it describes.
 */
export class AuditLogModel {
  private collection(): Promise<Collection<AuditLogDocument>> {
    return getCollection<AuditLogDocument>(COLLECTIONS.AUDIT_LOGS);
  }

  async insert(doc: Omit<AuditLogDocument, "_id">): Promise<AuditLogDocument> {
    try {
      const logs = await this.collection();
      const { insertedId } = await logs.insertOne(doc as AuditLogDocument);
      return { ...doc, _id: insertedId };
    } catch (err) {
      throw new DatabaseError("Failed to write audit log entry", { cause: err });
    }
  }

  async findByResource(resource: AuditResource, resourceId?: string): Promise<AuditLogDocument[]> {
    try {
      const logs = await this.collection();
      const query: Record<string, unknown> = { resource };
      if (resourceId) query.resource_id = resourceId;
      return await logs.find(query).sort({ created_at: -1 }).limit(200).toArray();
    } catch (err) {
      throw new DatabaseError("Failed to list audit log entries", { cause: err });
    }
  }
}
