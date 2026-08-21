import type { ObjectId, Collection, Document } from "mongodb";
import { getCollection } from "../db/mongo.client.js";
import { COLLECTIONS } from "../data/constants/collection.constant.js";
import { toObjectId } from "../utils/shared/object-id.util.js";
import { DatabaseError } from "../errors/database.error.js";
import { REQUIREMENT_STATUS } from "../data/constants/status.constant.js";
import type {
  TaskAuditEntry,
  TaskDocument,
  TaskStatus,
  TaskStepState,
} from "../lib/types/task/task.type.js";
import type { RequirementValue, TaskRequirement } from "../lib/types/task/requirement.type.js";

interface CounterDocument extends Document {
  _id: string;
  seq: number;
}

export class TaskModel {
  private collection(): Promise<Collection<TaskDocument>> {
    return getCollection<TaskDocument>(COLLECTIONS.TASKS);
  }

  private counters(): Promise<Collection<CounterDocument>> {
    return getCollection<CounterDocument>(COLLECTIONS.COUNTERS);
  }

  async insert(doc: Omit<TaskDocument, "_id">): Promise<TaskDocument> {
    try {
      const tasks = await this.collection();
      const { insertedId } = await tasks.insertOne(doc as TaskDocument);
      return { ...doc, _id: insertedId };
    } catch (err) {
      throw new DatabaseError("Failed to insert task", { cause: err });
    }
  }

  async findById(id: string | ObjectId): Promise<TaskDocument | null> {
    try {
      const tasks = await this.collection();
      return await tasks.findOne({ _id: toObjectId(id) });
    } catch (err) {
      throw new DatabaseError("Failed to look up task", { cause: err });
    }
  }

  async findAll(filters: { session_id?: string; status?: TaskStatus }): Promise<TaskDocument[]> {
    try {
      const tasks = await this.collection();
      const query: Record<string, unknown> = {};
      if (filters.session_id) query.session_id = filters.session_id;
      if (filters.status) query.status = filters.status;
      return await tasks.find(query).sort({ created_at: -1 }).toArray();
    } catch (err) {
      throw new DatabaseError("Failed to list tasks", { cause: err });
    }
  }

  async setValue(
    id: string | ObjectId,
    key: string,
    value: RequirementValue,
    requirementIndex: number,
  ): Promise<TaskDocument | null> {
    try {
      const tasks = await this.collection();
      await tasks.updateOne(
        { _id: toObjectId(id) },
        {
          $set: {
            [`values.${key}`]: value,
            [`requirements.${requirementIndex}.status`]: REQUIREMENT_STATUS.FILLED,
            updated_at: new Date(),
          },
        },
      );
    } catch (err) {
      throw new DatabaseError("Failed to set task value", { cause: err });
    }
    return this.findById(id);
  }

  async replaceSteps(id: string | ObjectId, steps: TaskStepState[]): Promise<TaskDocument | null> {
    try {
      const tasks = await this.collection();
      await tasks.updateOne(
        { _id: toObjectId(id) },
        { $set: { steps, updated_at: new Date() } },
      );
    } catch (err) {
      throw new DatabaseError("Failed to replace task steps", { cause: err });
    }
    return this.findById(id);
  }

  async setStatus(id: string | ObjectId, status: TaskStatus): Promise<TaskDocument | null> {
    try {
      const tasks = await this.collection();
      await tasks.updateOne(
        { _id: toObjectId(id) },
        { $set: { status, updated_at: new Date() } },
      );
    } catch (err) {
      throw new DatabaseError("Failed to set task status", { cause: err });
    }
    return this.findById(id);
  }

  async appendAudit(id: string | ObjectId, entry: TaskAuditEntry): Promise<TaskDocument | null> {
    try {
      const tasks = await this.collection();
      await tasks.updateOne(
        { _id: toObjectId(id) },
        { $push: { audit: entry }, $set: { updated_at: new Date() } },
      );
    } catch (err) {
      throw new DatabaseError("Failed to append task audit entry", { cause: err });
    }
    return this.findById(id);
  }

  async findByStepToken(token: string): Promise<TaskDocument | null> {
    try {
      const tasks = await this.collection();
      return await tasks.findOne({ "steps.approval_token": token });
    } catch (err) {
      throw new DatabaseError("Failed to look up task by step token", { cause: err });
    }
  }

  async updateStepAndStatus(
    id: string | ObjectId,
    steps: TaskStepState[],
    status: TaskStatus,
  ): Promise<TaskDocument | null> {
    try {
      const tasks = await this.collection();
      await tasks.updateOne(
        { _id: toObjectId(id) },
        { $set: { steps, status, updated_at: new Date() } },
      );
    } catch (err) {
      throw new DatabaseError("Failed to update task steps and status", { cause: err });
    }
    return this.findById(id);
  }

  /**
   * Same as `updateStepAndStatus`, but only writes if `stepId` is still unused
   * (`token_used_at: null`) at the moment of the write. Closes the check-then-write race
   * between reading `step.token_used_at` and issuing this update: two near-simultaneous
   * decisions on the same step can both pass the earlier in-memory check, but only one
   * of these conditional updates can match.
   */
  async updateStepAndStatusIfUnused(
    id: string | ObjectId,
    stepId: string,
    steps: TaskStepState[],
    status: TaskStatus,
  ): Promise<boolean> {
    try {
      const tasks = await this.collection();
      const { matchedCount } = await tasks.updateOne(
        {
          _id: toObjectId(id),
          steps: { $elemMatch: { step_id: stepId, token_used_at: null } },
        },
        { $set: { steps, status, updated_at: new Date() } },
      );
      return matchedCount > 0;
    } catch (err) {
      throw new DatabaseError("Failed to update task steps and status", { cause: err });
    }
  }

  async appendRequirement(id: string | ObjectId, requirement: TaskRequirement): Promise<TaskDocument | null> {
    try {
      const tasks = await this.collection();
      await tasks.updateOne(
        { _id: toObjectId(id) },
        { $push: { requirements: requirement }, $set: { updated_at: new Date() } },
      );
    } catch (err) {
      throw new DatabaseError("Failed to append task requirement", { cause: err });
    }
    return this.findById(id);
  }

  /**
   * How many tasks still point at a workflow, optionally narrowed to a set of
   * statuses. Used to refuse a template delete that would strand live requests
   * whose `/status` reads the template to render step names and the title.
   */
  async countByWorkflow(workflowId: string, statuses?: TaskStatus[]): Promise<number> {
    try {
      const tasks = await this.collection();
      const query: Record<string, unknown> = { workflow_id: workflowId };
      if (statuses && statuses.length > 0) query.status = { $in: statuses };
      return await tasks.countDocuments(query);
    } catch (err) {
      throw new DatabaseError("Failed to count tasks for workflow", { cause: err });
    }
  }

  /** Hard delete. The audit log, not this row, is what survives the removal. */
  async deleteById(id: string | ObjectId): Promise<boolean> {
    try {
      const tasks = await this.collection();
      const { deletedCount } = await tasks.deleteOne({ _id: toObjectId(id) });
      return deletedCount === 1;
    } catch (err) {
      throw new DatabaseError("Failed to delete task", { cause: err });
    }
  }

  async nextSequence(now = new Date()): Promise<number> {
    try {
      const counters = await this.counters();
      const counterId = `task_ref_${now.getFullYear()}`;
      const result = await counters.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after" },
      );
      if (!result) {
        throw new Error("Counter upsert returned no document");
      }
      return result.seq;
    } catch (err) {
      throw new DatabaseError("Failed to allocate task reference sequence", { cause: err });
    }
  }
}
