import { describe, expect, it } from "vitest";
import { applyTaskProgress } from "@/lib/workflow/applyTaskProgress";
import type { PlanNode } from "@/lib/workflow/toPlanNodes";
import type { TaskDto, TaskRequirement, TaskStatus, TaskStepState } from "@/types/task";

/** The shape `toPlanNodes` produces: synthetic head, the steps, synthetic tail. */
function planNodes(...stepIds: string[]): PlanNode[] {
  const node = (id: string, label: string): PlanNode => ({
    id,
    label,
    sub: "placeholder",
    status: "todo",
    inputs: [],
    note: null,
    meta: "",
  });

  return [
    { ...node("__submit", "Submit"), status: "done" },
    { ...node("__inputs", "Provide Details"), status: "current" },
    ...stepIds.map((id) => node(id, id)),
    node("__complete", "Collect Authorized Document"),
  ];
}

function step(step_id: string, state: TaskStepState["state"], extra: Partial<TaskStepState> = {}): TaskStepState {
  return {
    step_id,
    name: step_id,
    type: "approval",
    depends_on: [],
    state,
    assignee: null,
    outcome: null,
    reason: null,
    responded_at: null,
    approval_token: null,
    token_expires_at: null,
    token_used_at: null,
    notified_at: null,
    reopen_count: 0,
    ...extra,
  };
}

function requirement(status: TaskRequirement["status"]): TaskRequirement {
  return {
    key: "full_name",
    source: "input",
    ref: "full_name",
    label: "Full name",
    description: null,
    type: "string",
    required: true,
    validation: null,
    collection_hint: null,
    status,
  };
}

function task(status: TaskStatus, steps: TaskStepState[], requirements: TaskRequirement[] = [requirement("filled")]): TaskDto {
  return {
    id: "t1",
    reference: "REQ-2026-001",
    session_id: "s1",
    workflow_id: "wf1",
    version: 1,
    status,
    requirements,
    values: {},
    steps,
    audit: [],
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-02T00:00:00.000Z",
  };
}

const byId = (nodes: PlanNode[]) => new Map(nodes.map((n) => [n.id, n]));

describe("applyTaskProgress", () => {
  it("marks a completed task's approved steps done and its outcome collectable", () => {
    const result = byId(
      applyTaskProgress(
        planNodes("advisor", "hod"),
        task("completed", [step("advisor", "approved"), step("hod", "approved")]),
      ),
    );

    expect(result.get("advisor")?.status).toBe("done");
    expect(result.get("advisor")?.meta).toBe("Approved");
    expect(result.get("hod")?.status).toBe("done");
    expect(result.get("__complete")?.status).toBe("done");
    expect(result.get("__complete")?.meta).toBe("Ready to collect");
  });

  it("shows the awaiting step as current while the rest stay todo", () => {
    const result = byId(
      applyTaskProgress(
        planNodes("advisor", "hod", "dean"),
        task("in_progress", [
          step("advisor", "approved"),
          step("hod", "pending_approval"),
          step("dean", "blocked"),
        ]),
      ),
    );

    expect(result.get("advisor")?.status).toBe("done");
    expect(result.get("hod")?.status).toBe("current");
    expect(result.get("hod")?.meta).toBe("Waiting for a decision");
    expect(result.get("dean")?.status).toBe("todo");
    expect(result.get("__complete")?.status).toBe("todo");
  });

  it("keeps a rejected step on the plan and carries its reason", () => {
    const result = byId(
      applyTaskProgress(
        planNodes("advisor"),
        task("rejected", [step("advisor", "rejected", { outcome: "rejected", reason: "Dates clash." })]),
      ),
    );

    expect(result.get("advisor")?.status).toBe("done");
    expect(result.get("advisor")?.meta).toBe("Rejected — Dates clash.");
    // The document is never issued, and the plan says why rather than going quiet.
    expect(result.get("__complete")?.status).toBe("todo");
    expect(result.get("__complete")?.sub).toBe("Not issued — the request was rejected");
  });

  it("holds the details node as current while a requirement is still pending", () => {
    const result = byId(
      applyTaskProgress(
        planNodes("advisor"),
        task("collecting", [step("advisor", "blocked")], [requirement("pending")]),
      ),
    );

    expect(result.get("__inputs")?.status).toBe("current");
    expect(result.get("__inputs")?.meta).toBe("");
  });

  it("marks the details node done once every requirement is answered", () => {
    const result = byId(
      applyTaskProgress(planNodes("advisor"), task("in_progress", [step("advisor", "pending_approval")])),
    );

    expect(result.get("__inputs")?.status).toBe("done");
    expect(result.get("__inputs")?.meta).toBe("Provided");
  });

  it("names the real approver once one is resolved", () => {
    const result = byId(
      applyTaskProgress(
        planNodes("advisor"),
        task("in_progress", [
          step("advisor", "pending_approval", { assignee: { name: "Dr Perera", email: "p@uni.edu" } }),
        ]),
      ),
    );

    expect(result.get("advisor")?.sub).toBe("Dr Perera");
  });

  it("leaves a plan node the task never planned untouched", () => {
    const result = byId(applyTaskProgress(planNodes("advisor"), task("in_progress", [])));

    expect(result.get("advisor")?.status).toBe("todo");
    expect(result.get("advisor")?.sub).toBe("placeholder");
  });

  it("treats a skipped step as settled, not outstanding", () => {
    const result = byId(
      applyTaskProgress(planNodes("advisor"), task("completed", [step("advisor", "skipped")])),
    );

    expect(result.get("advisor")?.status).toBe("done");
    expect(result.get("advisor")?.meta).toBe("Not required");
  });
});
