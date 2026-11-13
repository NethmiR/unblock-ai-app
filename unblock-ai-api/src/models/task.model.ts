import { ObjectId, type Collection, type Filter } from "mongodb";
import { getCollection } from "../db/mongo.client.js";
import { COLLECTIONS } from "../data/constants/collection.constant.js";
import { DatabaseError } from "../errors/database.error.js";
import { taskRevisionConflict } from "../errors/task.error.js";
import type { TaskDocument } from "../lib/types/task/task-document.type.js";
import type { TaskListFilter, TaskListPage } from "../lib/types/task/task-dto.type.js";

interface CounterDocument {
  _id: string;
  seq: number;
}

const COUNTER_PREFIX = "task_ref_";
const REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;
const CASE_INSENSITIVE = "i";

export interface ITaskModel {
  insert(task: TaskDocument): Promise<TaskDocument>;
  findById(id: string): Promise<TaskDocument | null>;
  findOwnedSummaryPage(userId: string, filter: TaskListFilter): Promise<TaskListPage<TaskDocument>>;
  findCreatorById(id: string): Promise<string | null>;
  replaceWithRevision(task: TaskDocument, expectedRevision: number): Promise<TaskDocument>;
  findByApprovalTokenHash(tokenHash: string): Promise<TaskDocument | null>;
  deleteById(id: string): Promise<boolean>;
  nextSequence(now?: Date): Promise<number>;
}

export function parseTaskId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export function escapeRegex(text: string): string {
  return text.replace(REGEX_SPECIAL_CHARACTERS, "\\$&");
}

export class TaskModel implements ITaskModel {
  private collection(): Promise<Collection<TaskDocument>> {
    return getCollection<TaskDocument>(COLLECTIONS.TASKS);
  }

  private counters(): Promise<Collection<CounterDocument>> {
    return getCollection<CounterDocument>(COLLECTIONS.COUNTERS);
  }

  async insert(task: TaskDocument): Promise<TaskDocument> {
    try {
      const tasks = await this.collection();
      await tasks.insertOne(task);
      return task;
    } catch (err) {
      throw new DatabaseError("Failed to insert task", { cause: err });
    }
  }

  async findById(id: string): Promise<TaskDocument | null> {
    const objectId = parseTaskId(id);
    if (objectId === null) return null;
    try {
      const tasks = await this.collection();
      return await tasks.findOne({ _id: objectId });
    } catch (err) {
      throw new DatabaseError("Failed to look up task", { cause: err });
    }
  }

  async findOwnedSummaryPage(userId: string, filter: TaskListFilter): Promise<TaskListPage<TaskDocument>> {
    const query: Filter<TaskDocument> = { created_by: userId };
    if (filter.status !== null) query.status = filter.status;
    if (filter.search !== null) {
      const pattern = new RegExp(escapeRegex(filter.search), CASE_INSENSITIVE);
      query.$or = [{ reference: pattern }, { title: pattern }];
    }
    try {
      const tasks = await this.collection();
      const [rows, total] = await Promise.all([
        tasks.find(query).sort({ updated_at: -1, _id: -1 }).skip(filter.offset).limit(filter.limit).toArray(),
        tasks.countDocuments(query),
      ]);
      return { tasks: rows, total };
    } catch (err) {
      throw new DatabaseError("Failed to list tasks", { cause: err });
    }
  }

  async findCreatorById(id: string): Promise<string | null> {
    const objectId = parseTaskId(id);
    if (objectId === null) return null;
    try {
      const tasks = await this.collection();
      const found = await tasks.findOne({ _id: objectId }, { projection: { created_by: 1 } });
      return found?.created_by ?? null;
    } catch (err) {
      throw new DatabaseError("Failed to look up task owner", { cause: err });
    }
  }

  async replaceWithRevision(task: TaskDocument, expectedRevision: number): Promise<TaskDocument> {
    const next: TaskDocument = { ...task, revision: expectedRevision + 1 };
    let replaced: TaskDocument | null;
    try {
      const tasks = await this.collection();
      replaced = await tasks.findOneAndReplace({ _id: task._id, revision: expectedRevision }, next, { returnDocument: "after" });
    } catch (err) {
      throw new DatabaseError("Failed to save task", { cause: err });
    }
    if (!replaced) throw taskRevisionConflict();
    return replaced;
  }

  async findByApprovalTokenHash(tokenHash: string): Promise<TaskDocument | null> {
    try {
      const tasks = await this.collection();
      return await tasks.findOne({ "steps.approval.token_hash": tokenHash });
    } catch (err) {
      throw new DatabaseError("Failed to look up task by approval link", { cause: err });
    }
  }

  async deleteById(id: string): Promise<boolean> {
    const objectId = parseTaskId(id);
    if (objectId === null) return false;
    try {
      const tasks = await this.collection();
      const { deletedCount } = await tasks.deleteOne({ _id: objectId });
      return deletedCount === 1;
    } catch (err) {
      throw new DatabaseError("Failed to delete task", { cause: err });
    }
  }

  async nextSequence(now = new Date()): Promise<number> {
    try {
      const counters = await this.counters();
      const result = await counters.findOneAndUpdate(
        { _id: `${COUNTER_PREFIX}${now.getFullYear()}` },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after" },
      );
      if (!result) throw new Error("Counter upsert returned no document");
      return result.seq;
    } catch (err) {
      throw new DatabaseError("Failed to allocate task reference sequence", { cause: err });
    }
  }
}
