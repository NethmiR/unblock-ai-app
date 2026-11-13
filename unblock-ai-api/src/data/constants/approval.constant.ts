export enum ApprovalAssignmentState {
  PENDING = "pending",
  DECIDED = "decided",
}

export const APPROVER_ROUTE_SEGMENT = {
  ROOT: "approver",
  APPROVALS: "approvals",
  PENDING: "pending",
  HISTORY: "history",
  SUMMARY: "summary",
  STEPS: "steps",
  DECISION: "decision",
} as const;
