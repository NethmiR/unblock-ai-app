import type { ObjectId, Collection } from "mongodb";
import { getCollection } from "../db/mongo.client.js";
import { COLLECTIONS } from "../data/constants/collection.constant.js";
import { toObjectId } from "../utils/shared/object-id.util.js";
import { DatabaseError } from "../errors/database.error.js";
import type { DraftDocument } from "../lib/types/draft/draft.type.js";

export class DraftModel {
  private collection(): Promise<Collection<DraftDocument>> {
    return getCollection<DraftDocument>(COLLECTIONS.DRAFTS);
  }

  async findByTextHash(hash: string): Promise<DraftDocument | null> {
    try {
      const drafts = await this.collection();
      return await drafts.findOne({ text_sha256: hash });
    } catch (err) {
      throw new DatabaseError("Failed to look up draft by text hash", { cause: err });
    }
  }

  async insert(doc: Omit<DraftDocument, "_id">): Promise<DraftDocument> {
    try {
      const drafts = await this.collection();
      const { insertedId } = await drafts.insertOne(doc as DraftDocument);
      return { ...doc, _id: insertedId };
    } catch (err) {
      throw new DatabaseError("Failed to insert draft", { cause: err });
    }
  }

  async findById(id: string | ObjectId): Promise<DraftDocument | null> {
    try {
      const drafts = await this.collection();
      return await drafts.findOne({ _id: toObjectId(id) });
    } catch (err) {
      throw new DatabaseError("Failed to look up draft by id", { cause: err });
    }
  }

  async findAll(options: { limit: number }): Promise<DraftDocument[]> {
    try {
      const drafts = await this.collection();
      return await drafts.find({}).sort({ created_at: -1 }).limit(options.limit).toArray();
    } catch (err) {
      throw new DatabaseError("Failed to list drafts", { cause: err });
    }
  }

  async patch(id: string | ObjectId, fields: Partial<DraftDocument>): Promise<DraftDocument | null> {
    try {
      const drafts = await this.collection();
      await drafts.updateOne(
        { _id: toObjectId(id) },
        { $set: { ...fields, updated_at: new Date() } },
      );
    } catch (err) {
      throw new DatabaseError("Failed to patch draft", { cause: err });
    }
    return this.findById(id);
  }
}
