import type { ObjectId, Collection } from "mongodb";
import { getCollection } from "../db/mongo.client.js";
import { COLLECTIONS } from "../data/constants/collection.constant.js";
import { toObjectId } from "../utils/shared/object-id.util.js";
import { DatabaseError } from "../errors/database.error.js";
import type {
  SelectionSessionDocument,
  SessionOutcome,
  SessionRound,
} from "../lib/types/selection/session.type.js";

export class SelectionSessionModel {
  private collection(): Promise<Collection<SelectionSessionDocument>> {
    return getCollection<SelectionSessionDocument>(COLLECTIONS.SELECTION_SESSIONS);
  }

  async insert(doc: Omit<SelectionSessionDocument, "_id">): Promise<SelectionSessionDocument> {
    try {
      const sessions = await this.collection();
      const { insertedId } = await sessions.insertOne(doc as SelectionSessionDocument);
      return { ...doc, _id: insertedId };
    } catch (err) {
      throw new DatabaseError("Failed to insert selection session", { cause: err });
    }
  }

  async findById(id: string | ObjectId): Promise<SelectionSessionDocument | null> {
    try {
      const sessions = await this.collection();
      return await sessions.findOne({ _id: toObjectId(id) });
    } catch (err) {
      throw new DatabaseError("Failed to look up selection session", { cause: err });
    }
  }

  async pushRound(id: string | ObjectId, round: SessionRound): Promise<SelectionSessionDocument | null> {
    try {
      const sessions = await this.collection();
      await sessions.updateOne(
        { _id: toObjectId(id) },
        { $push: { rounds: round }, $set: { updated_at: new Date() } },
      );
    } catch (err) {
      throw new DatabaseError("Failed to push selection session round", { cause: err });
    }
    return this.findById(id);
  }

  async setRoundAnswer(
    id: string | ObjectId,
    index: number,
    answer: string,
  ): Promise<SelectionSessionDocument | null> {
    try {
      const sessions = await this.collection();
      await sessions.updateOne(
        { _id: toObjectId(id) },
        {
          $set: {
            [`rounds.${index}.answer`]: answer,
            [`rounds.${index}.answered_at`]: new Date(),
            updated_at: new Date(),
          },
        },
      );
    } catch (err) {
      throw new DatabaseError("Failed to set selection session round answer", { cause: err });
    }
    return this.findById(id);
  }

  async finalize(
    id: string | ObjectId,
    outcome: SessionOutcome,
    selectedWorkflowId: string | null,
  ): Promise<SelectionSessionDocument | null> {
    try {
      const sessions = await this.collection();
      await sessions.updateOne(
        { _id: toObjectId(id) },
        { $set: { outcome, selected_workflow_id: selectedWorkflowId, updated_at: new Date() } },
      );
    } catch (err) {
      throw new DatabaseError("Failed to finalize selection session", { cause: err });
    }
    return this.findById(id);
  }
}
