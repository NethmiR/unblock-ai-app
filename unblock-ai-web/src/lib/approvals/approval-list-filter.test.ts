import { describe, expect, it } from "vitest";
import { APPROVAL_LIST_PAGE_SIZE } from "./approval-constant";
import { approvalHistoryQuery, isApprovalListFiltered, offsetParam, parseDecisionParam, pendingApprovalQuery } from "./approval-list-filter";
import { ApprovalDecision } from "@/types/task";

describe("approval list filters", () => {
  it("parses every decision value and rejects anything else", () => {
    for (const decision of Object.values(ApprovalDecision)) expect(parseDecisionParam(decision)).toBe(decision);
    expect(parseDecisionParam("APPROVED")).toBeNull();
    expect(parseDecisionParam("")).toBeNull();
    expect(parseDecisionParam(null)).toBeNull();
  });

  it("drops the offset from the URL on the first page", () => {
    expect(offsetParam(0)).toBeNull();
    expect(offsetParam(40)).toBe("40");
  });

  it("builds the pending query with a trimmed search and the page size", () => {
    expect(pendingApprovalQuery({ search: "  leave ", offset: 20 })).toEqual({ search: "leave", limit: APPROVAL_LIST_PAGE_SIZE, offset: 20 });
    expect(pendingApprovalQuery({ search: "   ", offset: 0 })).toEqual({ search: null, limit: APPROVAL_LIST_PAGE_SIZE, offset: 0 });
  });

  it("adds the decision to the history query", () => {
    expect(approvalHistoryQuery({ search: "", offset: 0, decision: ApprovalDecision.REJECTED })).toEqual({
      search: null,
      limit: APPROVAL_LIST_PAGE_SIZE,
      offset: 0,
      decision: ApprovalDecision.REJECTED,
    });
  });

  it("treats a search or a decision as a filter, but not whitespace", () => {
    expect(isApprovalListFiltered({ search: "", offset: 0 })).toBe(false);
    expect(isApprovalListFiltered({ search: "  ", offset: 0, decision: null })).toBe(false);
    expect(isApprovalListFiltered({ search: "TR-1", offset: 0 })).toBe(true);
    expect(isApprovalListFiltered({ search: "", offset: 0, decision: ApprovalDecision.APPROVED })).toBe(true);
  });
});
