import { TASK_FIELD_LIMIT } from "../data/constants/task.constant.js";
import type { ITaskModel } from "../models/task.model.js";
import type { ApprovalAssignmentFilter, ApprovalAssignmentPage } from "../lib/types/approval/approval.type.js";
import type { ApproverIdentity } from "../lib/types/approval/approver-identity.type.js";

export interface ApproverAssignmentServiceOptions {
  taskModel: Pick<ITaskModel, "findApprovalAssignmentPage" | "countPendingApprovalAssignments">;
}

export class ApproverAssignmentService {
  private readonly taskModel: ApproverAssignmentServiceOptions["taskModel"];

  constructor({ taskModel }: ApproverAssignmentServiceOptions) {
    this.taskModel = taskModel;
  }

  list(identity: ApproverIdentity, filter: ApprovalAssignmentFilter): Promise<ApprovalAssignmentPage> {
    const search = filter.search?.trim().slice(0, TASK_FIELD_LIMIT.SEARCH_MAX_LENGTH) ?? null;
    return this.taskModel.findApprovalAssignmentPage(identity, {
      ...filter,
      search: search === "" ? null : search,
      limit: Math.min(Math.max(filter.limit, 1), TASK_FIELD_LIMIT.LIST_MAX_LIMIT),
      offset: Math.max(filter.offset, 0),
    });
  }

  pendingCount(identity: ApproverIdentity): Promise<number> {
    return this.taskModel.countPendingApprovalAssignments(identity);
  }
}
