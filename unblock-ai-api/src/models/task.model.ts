import { ObjectId, type Collection, type Document, type Filter, type Sort } from "mongodb";
import { getCollection } from "../db/mongo.client.js";
import { COLLECTIONS } from "../data/constants/collection.constant.js";
import { DatabaseError } from "../errors/database.error.js";
import { taskRevisionConflict } from "../errors/task.error.js";
import { ApprovalAssignmentState } from "../data/constants/approval.constant.js";
import { ACTIVE_TASK_STEP_STATUSES, TaskStatus } from "../data/constants/task.constant.js";
import { approvalAssignmentStepMatch, unwoundStepMatch } from "../utils/approval/approver-identity.util.js";
import type { ApprovalAssignmentFilter, ApprovalAssignmentPage, TaskAssignmentProjection } from "../lib/types/approval/approval.type.js";
import type { ApproverIdentity } from "../lib/types/approval/approver-identity.type.js";
import type { TaskDocument, TaskStepRecord } from "../lib/types/task/task-document.type.js";
import type { TaskListFilter, TaskListPage } from "../lib/types/task/task-dto.type.js";

interface CounterDocument {
  _id: string;
  seq: number;
}

const COUNTER_PREFIX = "task_ref_";
const REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;
const CASE_INSENSITIVE = "i";
const STEPS_FIELD = "steps";

type ApprovalAssignmentCriteria = Pick<ApprovalAssignmentFilter, "state" | "decision" | "search">;

type UnwoundAssignment = TaskAssignmentProjection & { steps: TaskStepRecord };

interface ApprovalAssignmentFacet {
  rows: UnwoundAssignment[];
  total: Array<{ count: number }>;
}

interface CountResult {
  count: number;
}

const ASSIGNMENT_SORT: Readonly<Record<ApprovalAssignmentState, Sort>> = {
  [ApprovalAssignmentState.PENDING]: { "steps.activated_at": 1, _id: 1, "steps.id": 1 },
  [ApprovalAssignmentState.DECIDED]: { "steps.approval.decided_at": -1, _id: -1, "steps.id": -1 },
};

const FIRST_ACTIVE_STEP_NAME: Document = {
  $ifNull: [
    {
      $arrayElemAt: [
        {
          $map: {
            input: { $filter: { input: "$steps", as: "s", cond: { $in: ["$$s.status", [...ACTIVE_TASK_STEP_STATUSES]] } } },
            as: "s",
            in: "$$s.name",
          },
        },
        0,
      ],
    },
    null,
  ],
};

const ASSIGNMENT_PROJECTION: Document[] = [
  {
    $set: {
      forms: { $map: { input: "$forms", as: "f", in: { step_id: "$$f.step_id", submitted_at: "$$f.submitted_at" } } },
      active_step_name: FIRST_ACTIVE_STEP_NAME,
    },
  },
  { $unset: ["values", "conversation", "audit"] },
];

export interface ITaskModel {
  insert(task: TaskDocument): Promise<TaskDocument>;
  findById(id: string): Promise<TaskDocument | null>;
  findOwnedSummaryPage(userId: string, filter: TaskListFilter): Promise<TaskListPage<TaskDocument>>;
  findCreatorById(id: string): Promise<string | null>;
  replaceWithRevision(task: TaskDocument, expectedRevision: number): Promise<TaskDocument>;
  findByApprovalTokenHash(tokenHash: string): Promise<TaskDocument | null>;
  findApprovalAssignmentPage(identity: ApproverIdentity, filter: ApprovalAssignmentFilter): Promise<ApprovalAssignmentPage>;
  countPendingApprovalAssignments(identity: ApproverIdentity): Promise<number>;
  deleteById(id: string): Promise<boolean>;
  nextSequence(now?: Date): Promise<number>;
}

export function parseTaskId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export function escapeRegex(text: string): string {
  return text.replace(REGEX_SPECIAL_CHARACTERS, "\\$&");
}

function assignmentMatches(identity: ApproverIdentity, criteria: ApprovalAssignmentCriteria): { base: Filter<TaskDocument>; unwound: Filter<TaskDocument> } {
  const stepMatch = approvalAssignmentStepMatch(identity, criteria);
  // $elemMatch keeps the status and the identity on the same step; separate dotted paths could match two different steps.
  const base: Filter<TaskDocument> = { created_by: { $ne: identity.userId }, steps: { $elemMatch: stepMatch } };
  if (criteria.state === ApprovalAssignmentState.PENDING) base.status = TaskStatus.IN_PROGRESS;
  if (criteria.search !== null) {
    const pattern = new RegExp(escapeRegex(criteria.search), CASE_INSENSITIVE);
    base.$or = [{ reference: pattern }, { title: pattern }, { "requester.full_name": pattern }];
  }
  return { base, unwound: unwoundStepMatch(stepMatch, STEPS_FIELD) };
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

  async findApprovalAssignmentPage(identity: ApproverIdentity, filter: ApprovalAssignmentFilter): Promise<ApprovalAssignmentPage> {
    const { base, unwound } = assignmentMatches(identity, filter);
    try {
      const tasks = await this.collection();
      const [facet] = await tasks
        .aggregate<ApprovalAssignmentFacet>([
          { $match: base },
          ...ASSIGNMENT_PROJECTION,
          { $unwind: `$${STEPS_FIELD}` },
          { $match: unwound },
          { $sort: ASSIGNMENT_SORT[filter.state] },
          { $facet: { rows: [{ $skip: filter.offset }, { $limit: filter.limit }], total: [{ $count: "count" }] } },
        ])
        .toArray();
      return {
        rows: (facet?.rows ?? []).map(({ steps, ...task }) => ({ task, step: steps })),
        total: facet?.total[0]?.count ?? 0,
      };
    } catch (err) {
      throw new DatabaseError("Failed to list approval assignments", { cause: err });
    }
  }

  async countPendingApprovalAssignments(identity: ApproverIdentity): Promise<number> {
    const { base, unwound } = assignmentMatches(identity, { state: ApprovalAssignmentState.PENDING, decision: null, search: null });
    try {
      const tasks = await this.collection();
      const [result] = await tasks
        .aggregate<CountResult>([
          { $match: base },
          { $project: { [STEPS_FIELD]: 1 } },
          { $unwind: `$${STEPS_FIELD}` },
          { $match: unwound },
          { $count: "count" },
        ])
        .toArray();
      return result?.count ?? 0;
    } catch (err) {
      throw new DatabaseError("Failed to count pending approval assignments", { cause: err });
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
