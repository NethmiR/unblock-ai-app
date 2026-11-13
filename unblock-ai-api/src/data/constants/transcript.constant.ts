import { ApprovalDecision } from "./task.constant.js";

export const TRANSCRIPT_COPY = {
  STATUS_COMPLETED: "Completed",
  REFERENCE: "Task reference",
  STATUS: "Status",
  SUBMITTED: "Submitted",
  COMPLETED: "Completed",
  REQUESTER: "Requester",
  REQUESTER_NAME: "Name",
  REQUESTER_EMAIL: "Email address",
  REQUESTER_UNIT: "Affiliation",
  CONVERSATION: "Original request",
  INFORMATION_REQUESTS: "Information requests",
  ASKED_BY: "Asked by",
  QUESTION: "Question",
  ANSWER: "Answer",
  APPROVALS: "Approval trail",
  APPROVER: "Approver",
  DESIGNATION: "Designation",
  DECISION: "Decision",
  COMMENT: "Comment",
  NOT_REQUIRED: "Not required",
  SKIPPED_STEPS: "Steps not required",
  COMPUTED: "Calculated values",
  FOOTER: "System-generated transcript",
  EMPTY: "—",
  SECTION_SEPARATOR: " — ",
  DESIGNATION_SEPARATOR: ", ",
} as const;

export const TRANSCRIPT_DECISION_LABEL: Readonly<Record<ApprovalDecision, string>> = {
  [ApprovalDecision.APPROVED]: "Approved",
  [ApprovalDecision.REJECTED]: "Rejected",
  [ApprovalDecision.REQUEST_MORE_INFO]: "More information requested",
};

export const TRANSCRIPT_FILE_SUFFIX = "-transcript";
