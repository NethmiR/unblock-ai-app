import type { PlanNode, PlanNodeStatus } from "./toPlanNodes";
import type { TaskDto, StepRuntimeState } from "@/types/task";

/** How a step's runtime state reads on the requester's plan. */
const STATE_TO_STATUS: Record<StepRuntimeState, PlanNodeStatus> = {
  blocked: "todo",
  ready: "todo",
  pending_approval: "current",
  approved: "done",
  rejected: "done",   // decided, just not favourably - `meta` carries the verdict
  skipped: "done",
};

/** Short verdict shown under a decided step. */
const STATE_TO_META: Partial<Record<StepRuntimeState, string>> = {
  approved: "Approved",
  rejected: "Rejected",
  skipped: "Not required",
  pending_approval: "Waiting for a decision",
};

/**
 * Overlays a task's real progress onto the plan produced by `toPlanNodes`.
 *
 * `toPlanNodes` describes a workflow that has NOT been submitted - it hardcodes
 * "submit is done, provide-details is current, every step is todo". That is
 * right for the composer and wrong everywhere else, so rather than teach it
 * about tasks this maps over its output. The split keeps `toPlanNodes` a pure
 * function of the workflow, which is what the composer needs.
 *
 * PURE FUNCTION - no I/O, no side effects.
 */
export function applyTaskProgress(nodes: PlanNode[], task: TaskDto): PlanNode[] {
  const stepById = new Map(task.steps.map((s) => [s.step_id, s]));
  const isFinished = task.status === "completed";
  const isStopped = task.status === "rejected" || task.status === "cancelled";

  return nodes.map((node) => {
    // The synthetic head/tail nodes have no counterpart in `task.steps`.
    if (node.id === "__submit") {
      return { ...node, status: "done", meta: "Submitted" };
    }

    if (node.id === "__inputs") {
      const pending = task.requirements.some((r) => r.status === "pending");
      /**
       * The button that opens requirement collection lives on THIS node,
       * because this is the step that is waiting on the person reading the
       * plan. It is offered only while the task is `collecting` - the same
       * gate `RequirementDialog` applies - so a task already sent for approval
       * shows the answers as provided with nothing left to click.
       *
       * `sub` and the "Coming next" eyebrow both come from `toPlanNodes`,
       * which describes an unsubmitted workflow. Once a task exists this step
       * is genuinely current and actionable, so both are corrected here.
       */
      const isCollecting = task.status === "collecting";
      if (pending && isCollecting) {
        return {
          ...node,
          status: "current",
          sub: "We need these before this can go to an approver",
          meta: "",
          eyebrow: undefined,
          action: task.requirements.some((r) => r.status !== "pending")
            ? "Continue"
            : "Provide details",
        };
      }
      return {
        ...node,
        status: pending ? "current" : "done",
        meta: pending ? "" : "Provided",
      };
    }

    if (node.id === "__complete") {
      if (isFinished) return { ...node, status: "done", meta: "Ready to collect" };
      if (isStopped) {
        return {
          ...node,
          status: "todo",
          meta: "",
          sub: task.status === "rejected" ? "Not issued — the request was rejected" : "Not issued — the request was cancelled",
        };
      }
      return { ...node, status: "todo" };
    }

    const step = stepById.get(node.id);
    if (!step) return node;   // a plan node the task never planned - leave it alone

    return {
      ...node,
      status: STATE_TO_STATUS[step.state],
      sub: step.assignee?.name ?? node.sub,
      meta: buildMeta(step.state, step.outcome, step.reason),
    };
  });
}

function buildMeta(
  state: StepRuntimeState,
  outcome: string | null,
  reason: string | null,
): string {
  const base = STATE_TO_META[state] ?? "";
  if (state === "rejected" && reason) return `${base} — ${reason}`;
  if (outcome === "request_more_info") return "More information requested";
  return base;
}
