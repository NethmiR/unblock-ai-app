import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import { ASSIGNEE_SOURCE_LABELS, assigneeDisplayName, overviewAssigneeLabel } from "./assignee-presentation";
import { requesterFactMessage } from "./requester-fact-message";
import { SELECTION_TRACE_MESSAGES, hasAudienceExclusion, selectionTraceMessage } from "./selection-trace-message";
import { TASK_FIELD_ISSUE_MESSAGES, parseFieldIssues, taskFieldIssueMessage } from "./task-field-issue-message";
import { TASK_REQUEST_ERROR_MESSAGES, hasErrorCode, taskRequestErrorMessage } from "./task-error-message";
import {
  APPROVAL_DECISION_PRESENTATION,
  TASK_STATUS_PRESENTATION,
  TASK_STEP_KIND_PRESENTATION,
  TASK_STEP_STATUS_PRESENTATION,
} from "./task-status-presentation";
import { DesignationCategory } from "@/types/designation";
import { OrganisationalUnitType } from "@/types/organisational-unit";
import { RequesterProfileFactKind } from "@/types/requester";
import { SelectionErrorCode, SelectionTraceStep } from "@/types/selection";
import { ApprovalDecision, AssigneeSource, TaskErrorCode, TaskStatus, TaskStepKind, TaskStepStatus } from "@/types/task";
import { FormFieldIssueCode } from "@/types/task-form";

function coversEvery(values: readonly string[], map: object): void {
  expect(Object.keys(map).sort()).toEqual([...values].sort());
}

describe("presentation maps", () => {
  it("label every enum value", () => {
    coversEvery(Object.values(TaskStatus), TASK_STATUS_PRESENTATION);
    coversEvery(Object.values(TaskStepStatus), TASK_STEP_STATUS_PRESENTATION);
    coversEvery(Object.values(ApprovalDecision), APPROVAL_DECISION_PRESENTATION);
    coversEvery(Object.values(TaskStepKind), TASK_STEP_KIND_PRESENTATION);
    coversEvery(Object.values(AssigneeSource), ASSIGNEE_SOURCE_LABELS);
    coversEvery(Object.values(SelectionTraceStep), SELECTION_TRACE_MESSAGES);
    coversEvery(Object.values(FormFieldIssueCode), TASK_FIELD_ISSUE_MESSAGES);
    for (const code of [...Object.values(TaskErrorCode), ...Object.values(SelectionErrorCode)]) {
      expect(TASK_REQUEST_ERROR_MESSAGES[code]).toBeTruthy();
    }
  });
});

describe("assignee presentation", () => {
  const base = { full_name: null, email: null, designation_title: null, organisational_unit_name: null, note: null };

  it("names the person, falling back to the designation", () => {
    expect(assigneeDisplayName({ ...base, source: AssigneeSource.DIRECTORY, full_name: "Dinesh" })).toBe("Dinesh");
    expect(assigneeDisplayName({ ...base, source: AssigneeSource.DIRECTORY, designation_title: "Dean" })).toBe("Dean");
    expect(assigneeDisplayName({ ...base, source: AssigneeSource.REQUESTER })).toBe("You");
  });

  it("describes overview assignees without API wording", () => {
    expect(overviewAssigneeLabel({ source: AssigneeSource.DIRECTORY, label: "Head of Department" })).toBe("Head of Department");
    expect(overviewAssigneeLabel({ source: AssigneeSource.SYSTEM, label: null })).toBe("Automatic");
    expect(overviewAssigneeLabel({ source: AssigneeSource.REQUESTER_SUPPLIED, label: "Academic Advisor" })).toBe(
      "Academic Advisor · You'll name this person",
    );
  });
});

describe("trace and fact messages", () => {
  it("renders trace entries", () => {
    const entry = { step: SelectionTraceStep.EXCLUDED_BY_AUDIENCE, count: 1, workflow_template_titles: ["Engineering leave"] };
    expect(selectionTraceMessage(entry)).toContain("Engineering leave");
    expect(selectionTraceMessage({ step: SelectionTraceStep.CANDIDATES_RETRIEVED, count: 1, workflow_template_titles: [] })).toBe(
      "Found 1 possibly matching process",
    );
    expect(hasAudienceExclusion([entry])).toBe(true);
    expect(hasAudienceExclusion([])).toBe(false);
  });

  it("renders profile facts as sentences", () => {
    const unit = { id: "1", code: "DIT", name: "Department of Information Technology", unit_type: OrganisationalUnitType.DEPARTMENT, is_archived: false };
    const parent = { id: "2", code: "FIT", name: "Faculty of Information Technology", unit_type: OrganisationalUnitType.FACULTY, is_archived: false };
    expect(requesterFactMessage({ id: "P1", kind: RequesterProfileFactKind.MEMBER_OF_UNIT, unit, parent, designation: null })).toBe(
      "You are a member of Department of Information Technology, under Faculty of Information Technology",
    );
    const designation = { id: "d", code: "student", title: "Student", category: DesignationCategory.STUDENT, display_order: 1, is_archived: false };
    expect(requesterFactMessage({ id: "P2", kind: RequesterProfileFactKind.HOLDS_DESIGNATION, unit, parent, designation })).toBe(
      "You hold Student in Department of Information Technology",
    );
  });
});

describe("issues and errors", () => {
  it("formats issue messages with limits", () => {
    expect(taskFieldIssueMessage({ field_id: "a", code: FormFieldIssueCode.TOO_LONG, limit: 10 })).toBe("Enter at most 10 characters.");
  });

  it("parses only well-formed issues from error details", () => {
    expect(
      parseFieldIssues({ issues: [{ field_id: "a", code: "required", limit: null }, { field_id: "b", code: "bogus" }, "x"] }),
    ).toEqual([{ field_id: "a", code: FormFieldIssueCode.REQUIRED, limit: null }]);
    expect(parseFieldIssues(null)).toEqual([]);
  });

  it("maps known error codes and falls back otherwise", () => {
    const conflict = new ApiError("x", 409, TaskErrorCode.TASK_REVISION_CONFLICT);
    expect(taskRequestErrorMessage(conflict)).toContain("changed while you were working");
    expect(hasErrorCode(conflict, TaskErrorCode.TASK_REVISION_CONFLICT)).toBe(true);
    expect(taskRequestErrorMessage(new ApiError("x", 500, "OTHER"), "Fallback")).toBe("Fallback");
    expect(taskRequestErrorMessage(new Error("x"), "Fallback")).toBe("Fallback");
  });
});
