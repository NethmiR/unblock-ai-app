import { describe, expect, it } from "vitest";
import { assigneeSourceHint, assigneeSourceHintBadge } from "./assignee-source-hint";
import { AssigneeSource } from "@/types/task";
import type { Actor, ActorResolution } from "@/types/workflow";

const DESIGNATION_CODES = new Set(["head_of_department", "dean"]);

function actor(resolution: ActorResolution, role: string | null): Actor {
  return { resolution, role, relative_to: null, directory_query: null, fallback_role: null, display_name: null };
}

describe("assigneeSourceHint", () => {
  it("resolves designation roles through the directory", () => {
    expect(assigneeSourceHint(actor("dynamic", "head_of_department"), DESIGNATION_CODES)).toBe(AssigneeSource.DIRECTORY);
    expect(assigneeSourceHint(actor("static", "dean"), DESIGNATION_CODES)).toBe(AssigneeSource.DIRECTORY);
  });

  it("asks the requester for roles the directory does not model", () => {
    expect(assigneeSourceHint(actor("dynamic", "academic_advisor"), DESIGNATION_CODES)).toBe(AssigneeSource.REQUESTER_SUPPLIED);
    expect(assigneeSourceHint(actor("static", null), DESIGNATION_CODES)).toBe(AssigneeSource.REQUESTER_SUPPLIED);
  });

  it("does not use fallback roles for non-designation roles", () => {
    const withFallback: Actor = { ...actor("dynamic", "academic_advisor"), fallback_role: "dean" };
    expect(assigneeSourceHint(withFallback, DESIGNATION_CODES)).toBe(AssigneeSource.REQUESTER_SUPPLIED);
  });

  it("maps requester and system actors directly", () => {
    expect(assigneeSourceHint(actor("requester", null), DESIGNATION_CODES)).toBe(AssigneeSource.REQUESTER);
    expect(assigneeSourceHint(actor("system", null), DESIGNATION_CODES)).toBe(AssigneeSource.SYSTEM);
  });
});

describe("assigneeSourceHintBadge", () => {
  it("flags only directory and requester-supplied approvers", () => {
    expect(assigneeSourceHintBadge(AssigneeSource.DIRECTORY)?.tone).toBe("success");
    expect(assigneeSourceHintBadge(AssigneeSource.REQUESTER_SUPPLIED)?.tone).toBe("warn");
    expect(assigneeSourceHintBadge(AssigneeSource.REQUESTER)).toBeNull();
    expect(assigneeSourceHintBadge(AssigneeSource.SYSTEM)).toBeNull();
    expect(assigneeSourceHintBadge(null)).toBeNull();
  });
});
