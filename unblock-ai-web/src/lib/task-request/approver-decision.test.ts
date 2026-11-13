import { describe, expect, it } from "vitest";
import {
  APPROVAL_DECISION_BUTTON_VARIANT,
  APPROVAL_DECISION_EXPLANATION,
  decisionCommentIssue,
  isCommentRequired,
  normaliseDecisionComment,
  offeredDecisions,
} from "./approver-decision";
import { TASK_FIELD_LIMIT } from "@/types/task-form";
import { ApprovalDecision } from "@/types/task";

describe("approver decision rules", () => {
  it("offers allowed decisions in approve, more information, reject order", () => {
    const allowed = [ApprovalDecision.REJECTED, ApprovalDecision.APPROVED, ApprovalDecision.REQUEST_MORE_INFO];
    expect(offeredDecisions({ allowed_decisions: allowed })).toEqual([
      ApprovalDecision.APPROVED,
      ApprovalDecision.REQUEST_MORE_INFO,
      ApprovalDecision.REJECTED,
    ]);
  });

  it("drops decisions the step does not allow", () => {
    expect(offeredDecisions({ allowed_decisions: [ApprovalDecision.REJECTED, ApprovalDecision.APPROVED] })).toEqual([
      ApprovalDecision.APPROVED,
      ApprovalDecision.REJECTED,
    ]);
    expect(offeredDecisions({ allowed_decisions: [] })).toEqual([]);
  });

  it("reads comment requirement from the view", () => {
    const view = { comment_required_decisions: [ApprovalDecision.REJECTED] };
    expect(isCommentRequired(view, ApprovalDecision.REJECTED)).toBe(true);
    expect(isCommentRequired(view, ApprovalDecision.APPROVED)).toBe(false);
  });

  it("requires a non-blank comment only when required", () => {
    expect(decisionCommentIssue("   ", true)).not.toBeNull();
    expect(decisionCommentIssue("", false)).toBeNull();
    expect(decisionCommentIssue("Looks good", true)).toBeNull();
  });

  it("rejects comments over the limit", () => {
    const tooLong = "a".repeat(TASK_FIELD_LIMIT.COMMENT_MAX_LENGTH + 1);
    expect(decisionCommentIssue(tooLong, false)).not.toBeNull();
    expect(decisionCommentIssue("a".repeat(TASK_FIELD_LIMIT.COMMENT_MAX_LENGTH), true)).toBeNull();
  });

  it("normalises blank comments to null", () => {
    expect(normaliseDecisionComment("  ")).toBeNull();
    expect(normaliseDecisionComment("  ok ")).toBe("ok");
  });

  it("covers every decision in its presentation maps", () => {
    for (const decision of Object.values(ApprovalDecision)) {
      expect(APPROVAL_DECISION_BUTTON_VARIANT[decision]).toBeDefined();
      expect(APPROVAL_DECISION_EXPLANATION[decision]).toBeTruthy();
    }
  });
});
