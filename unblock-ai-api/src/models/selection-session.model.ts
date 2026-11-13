import { ObjectId, type Collection, type Filter } from "mongodb";
import { getCollection } from "../db/mongo.client.js";
import { COLLECTIONS } from "../data/constants/collection.constant.js";
import { DatabaseError } from "../errors/database.error.js";
import type { SelectionSessionDocument } from "../lib/types/selection/session.type.js";

export interface ISelectionSessionModel {
  insert(doc: Omit<SelectionSessionDocument, "_id">): Promise<SelectionSessionDocument>;
  findOwned(id: string, userId: string): Promise<SelectionSessionDocument | null>;
  replace(session: SelectionSessionDocument): Promise<void>;
  deleteOwned(id: string, userId: string): Promise<boolean>;
  deleteById(id: string): Promise<void>;
}

function parseId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function liveOwnedFilter(id: ObjectId, userId: string, now: Date): Filter<SelectionSessionDocument> {
  return { _id: id, created_by: userId, expires_at: { $gt: now } };
}

export class SelectionSessionModel implements ISelectionSessionModel {
  private collection(): Promise<Collection<SelectionSessionDocument>> {
    return getCollection<SelectionSessionDocument>(COLLECTIONS.SELECTION_SESSIONS);
  }

  async insert(doc: Omit<SelectionSessionDocument, "_id">): Promise<SelectionSessionDocument> {
    try {
      const sessions = await this.collection();
      const _id = new ObjectId();
      await sessions.insertOne({ ...doc, _id });
      return { ...doc, _id };
    } catch (err) {
      throw new DatabaseError("Failed to insert selection session", { cause: err });
    }
  }

  async findOwned(id: string, userId: string): Promise<SelectionSessionDocument | null> {
    const objectId = parseId(id);
    if (objectId === null) return null;
    try {
      const sessions = await this.collection();
      return await sessions.findOne(liveOwnedFilter(objectId, userId, new Date()));
    } catch (err) {
      throw new DatabaseError("Failed to look up selection session", { cause: err });
    }
  }

  async replace(session: SelectionSessionDocument): Promise<void> {
    try {
      const sessions = await this.collection();
      await sessions.replaceOne({ _id: session._id }, session);
    } catch (err) {
      throw new DatabaseError("Failed to save selection session", { cause: err });
    }
  }

  async deleteOwned(id: string, userId: string): Promise<boolean> {
    const objectId = parseId(id);
    if (objectId === null) return false;
    try {
      const sessions = await this.collection();
      const { deletedCount } = await sessions.deleteOne(liveOwnedFilter(objectId, userId, new Date()));
      return deletedCount > 0;
    } catch (err) {
      throw new DatabaseError("Failed to delete selection session", { cause: err });
    }
  }

  async deleteById(id: string): Promise<void> {
    const objectId = parseId(id);
    if (objectId === null) return;
    try {
      const sessions = await this.collection();
      await sessions.deleteOne({ _id: objectId });
    } catch (err) {
      throw new DatabaseError("Failed to delete selection session", { cause: err });
    }
  }
}
