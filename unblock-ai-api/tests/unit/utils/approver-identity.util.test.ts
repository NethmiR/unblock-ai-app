import test from "node:test";
import assert from "node:assert/strict";
import {
  approvalAssignmentStepMatch,
  approverIdentityOf,
  isAssignedTo,
  isLiveApproval,
  unwoundStepMatch,
} from "../../../src/utils/approval/approver-identity.util.js";
import { ApprovalAssignmentState } from "../../../src/data/constants/approval.constant.js";
import { AssigneeSource } from "../../../src/data/constants/assignee.constant.js";
import { ApprovalDecision, TaskStepKind, TaskStepStatus } from "../../../src/data/constants/task.constant.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import { buildTaskDocument, leaveResolutions } from "../../helpers/task-fixture.helper.js";
import type { TaskAssignee, TaskStepRecord } from "../../../src/lib/types/task/task-document.type.js";

const IDENTITY = approverIdentityOf({ id: "user-ishara", email: " Ishara@U.C " });

function assignee(userId: string | null, email: string | null): TaskAssignee {
  return {
    source: AssigneeSource.DIRECTORY,
    user_id: userId,
    full_name: "Ishara Bandara",
    email,
    designation_title: null,
    organisational_unit_name: null,
    field_id: null,
    note: null,
    candidates: [],
  };
}

function approvalStep(): TaskStepRecord {
  const task = buildTaskDocument(loadExpectedFixture("it_faculty_overseas_leave.json"), leaveResolutions());
  const step = task.steps.find((candidate) => candidate.kind === TaskStepKind.APPROVAL);
  assert.ok(step);
  return step;
}

test("the identity carries the user id and a normalised email", () => {
  assert.deepEqual(IDENTITY, { userId: "user-ishara", email: "ishara@u.c" });
});

test("an assignee matches by user id or by normalised email", () => {
  assert.equal(isAssignedTo(assignee("user-ishara", "other@u.c"), IDENTITY), true);
  assert.equal(isAssignedTo(assignee(null, "ishara@u.c"), IDENTITY), true);
  assert.equal(isAssignedTo(assignee("someone-else", "other@u.c"), IDENTITY), false);
  assert.equal(isAssignedTo(assignee(null, null), IDENTITY), false);
  assert.equal(isAssignedTo(null, IDENTITY), false);
});

test("a step is live only while it awaits the approver with no decision", () => {
  const step = approvalStep();
  const awaiting: TaskStepRecord = { ...step, status: TaskStepStatus.AWAITING_APPROVER };

  assert.equal(isLiveApproval(awaiting), true);
  assert.equal(isLiveApproval(step), false);
  assert.equal(isLiveApproval({ ...awaiting, approval: step.approval && { ...step.approval, decision: ApprovalDecision.APPROVED } }), false);
  assert.equal(isLiveApproval({ ...awaiting, approval: null }), false);
});

test("the pending step match requires an awaiting, undecided approval for the identity", () => {
  assert.deepEqual(approvalAssignmentStepMatch(IDENTITY, { state: ApprovalAssignmentState.PENDING, decision: ApprovalDecision.APPROVED }), {
    kind: TaskStepKind.APPROVAL,
    status: TaskStepStatus.AWAITING_APPROVER,
    "approval.decision": null,
    $or: [{ "assignee.user_id": "user-ishara" }, { "assignee.email": "ishara@u.c" }],
  });
});

test("the decided step match filters by decision when one is given", () => {
  const assigned = [{ "assignee.user_id": "user-ishara" }, { "assignee.email": "ishara@u.c" }];

  assert.deepEqual(approvalAssignmentStepMatch(IDENTITY, { state: ApprovalAssignmentState.DECIDED, decision: null }), {
    kind: TaskStepKind.APPROVAL,
    "approval.decision": { $ne: null },
    $or: assigned,
  });
  assert.deepEqual(approvalAssignmentStepMatch(IDENTITY, { state: ApprovalAssignmentState.DECIDED, decision: ApprovalDecision.REJECTED }), {
    kind: TaskStepKind.APPROVAL,
    "approval.decision": ApprovalDecision.REJECTED,
    $or: assigned,
  });
});

test("the unwound match prefixes every path, including inside $or", () => {
  const clause = approvalAssignmentStepMatch(IDENTITY, { state: ApprovalAssignmentState.DECIDED, decision: null });

  assert.deepEqual(unwoundStepMatch(clause, "steps"), {
    "steps.kind": TaskStepKind.APPROVAL,
    "steps.approval.decision": { $ne: null },
    $or: [{ "steps.assignee.user_id": "user-ishara" }, { "steps.assignee.email": "ishara@u.c" }],
  });
});
