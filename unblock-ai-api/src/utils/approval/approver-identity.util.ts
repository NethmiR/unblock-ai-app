import type { Document, Filter } from "mongodb";
import { ApprovalAssignmentState } from "../../data/constants/approval.constant.js";
import { TaskStepKind, TaskStepStatus } from "../../data/constants/task.constant.js";
import { normalizeEmail } from "../user/email.util.js";
import type { AuthenticatedUser } from "../../lib/types/auth/auth.type.js";
import type { ApprovalAssignmentFilter } from "../../lib/types/approval/approval.type.js";
import type { ApproverIdentity } from "../../lib/types/approval/approver-identity.type.js";
import type { TaskAssignee, TaskDocument, TaskStepRecord } from "../../lib/types/task/task-document.type.js";

const OPERATOR_PREFIX = "$";
const PATH_SEPARATOR = ".";

export function approverIdentityOf(user: Pick<AuthenticatedUser, "id" | "email">): ApproverIdentity {
  return { userId: user.id, email: normalizeEmail(user.email) };
}

export function isAssignedTo(assignee: TaskAssignee | null, identity: ApproverIdentity): boolean {
  if (assignee === null) return false;
  return (assignee.user_id !== null && assignee.user_id === identity.userId) || (assignee.email !== null && assignee.email === identity.email);
}

export function isLiveApproval(step: TaskStepRecord): boolean {
  return step.approval !== null && step.approval.decision === null && step.status === TaskStepStatus.AWAITING_APPROVER;
}

export function approvalAssignmentStepMatch(identity: ApproverIdentity, filter: Pick<ApprovalAssignmentFilter, "state" | "decision">): Filter<TaskStepRecord> {
  const assigned: Filter<TaskStepRecord>[] = [{ "assignee.user_id": identity.userId }, { "assignee.email": identity.email }];
  switch (filter.state) {
    case ApprovalAssignmentState.PENDING:
      return { kind: TaskStepKind.APPROVAL, status: TaskStepStatus.AWAITING_APPROVER, "approval.decision": null, $or: assigned };
    case ApprovalAssignmentState.DECIDED:
      return { kind: TaskStepKind.APPROVAL, "approval.decision": filter.decision ?? { $ne: null }, $or: assigned };
    default: {
      const unreachable: never = filter.state;
      return unreachable;
    }
  }
}

function prefixPaths(clause: Document, prefix: string): Document {
  const prefixed: Document = {};
  for (const [key, value] of Object.entries(clause)) {
    if (key.startsWith(OPERATOR_PREFIX)) {
      prefixed[key] = Array.isArray(value) ? value.map((entry: Document) => prefixPaths(entry, prefix)) : value;
    } else {
      prefixed[`${prefix}${PATH_SEPARATOR}${key}`] = value;
    }
  }
  return prefixed;
}

export function unwoundStepMatch(clause: Filter<TaskStepRecord>, stepsField: keyof Pick<TaskDocument, "steps">): Filter<TaskDocument> {
  return prefixPaths(clause, stepsField);
}
