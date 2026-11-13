import { describe, expect, it } from "vitest";
import { APPROVAL_CHANNEL_LABELS, decidedViaCaption, historyOutcomeText, waitingSince } from "./approval-assignment-presentation";
import { ApprovalChannel } from "@/types/approval";
import { ApprovalDecision, INFORMATION_REQUEST_STEP_NAME, TaskStatus } from "@/types/task";

const NOW = new Date("2026-11-13T12:00:00.000Z");

describe("approval assignment presentation", () => {
  it("labels every channel", () => {
    for (const channel of Object.values(ApprovalChannel)) expect(APPROVAL_CHANNEL_LABELS[channel]).toMatch(/\S/);
  });

  it("captions only decisions made through the emailed link", () => {
    expect(decidedViaCaption(ApprovalChannel.EMAIL_LINK)).toBe(APPROVAL_CHANNEL_LABELS[ApprovalChannel.EMAIL_LINK]);
    expect(decidedViaCaption(ApprovalChannel.APP)).toBeNull();
    expect(decidedViaCaption(null)).toBeNull();
  });

  it("measures waiting time from activation, falling back to submission", () => {
    expect(waitingSince({ activated_at: "2026-11-11T12:00:00.000Z", submitted_at: "2026-11-01T12:00:00.000Z" }, NOW)).toEqual({
      iso: "2026-11-11T12:00:00.000Z",
      relative: "2 days ago",
    });
    expect(waitingSince({ activated_at: null, submitted_at: "2026-11-13T09:00:00.000Z" }, NOW)).toEqual({
      iso: "2026-11-13T09:00:00.000Z",
      relative: "3 hours ago",
    });
  });

  describe("history outcome", () => {
    it("names the step the request moved on to", () => {
      expect(historyOutcomeText({ task_status: TaskStatus.IN_PROGRESS, decision: ApprovalDecision.APPROVED, current_step_name: "Dean approval" })).toBe(
        "Approved · now with Dean approval",
      );
    });

    it("says the request waits for the requester after more information was requested", () => {
      expect(
        historyOutcomeText({
          task_status: TaskStatus.IN_PROGRESS,
          decision: ApprovalDecision.REQUEST_MORE_INFO,
          current_step_name: INFORMATION_REQUEST_STEP_NAME,
        }),
      ).toBe("Waiting for the requester's answer");
    });

    it("shows the repeat review once the requester has answered", () => {
      expect(
        historyOutcomeText({
          task_status: TaskStatus.IN_PROGRESS,
          decision: ApprovalDecision.REQUEST_MORE_INFO,
          current_step_name: "Academic advisor review",
        }),
      ).toBe("More information requested · now with Academic advisor review");
    });

    it("falls back to in progress when no step is active", () => {
      expect(historyOutcomeText({ task_status: TaskStatus.IN_PROGRESS, decision: ApprovalDecision.APPROVED, current_step_name: null })).toBe("In progress");
    });

    it("describes every terminal status", () => {
      expect(historyOutcomeText({ task_status: TaskStatus.COMPLETED, decision: ApprovalDecision.APPROVED, current_step_name: null })).toBe("Request completed");
      expect(historyOutcomeText({ task_status: TaskStatus.REJECTED, decision: ApprovalDecision.REJECTED, current_step_name: null })).toBe("Rejected");
      expect(historyOutcomeText({ task_status: TaskStatus.CANCELLED, decision: ApprovalDecision.APPROVED, current_step_name: null })).toBe("Request cancelled");
    });

    it("gives a label for every task status", () => {
      for (const status of Object.values(TaskStatus)) {
        expect(historyOutcomeText({ task_status: status, decision: ApprovalDecision.APPROVED, current_step_name: null })).toMatch(/\S/);
      }
    });
  });
});
