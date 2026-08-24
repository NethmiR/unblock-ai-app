import type { Workflow, WorkflowStep } from "@/types/workflow";

export type PlanNodeStatus = "done" | "current" | "todo";

export interface PlanNode {
  id: string;
  label: string;
  sub: string;
  status: PlanNodeStatus;
  inputs: string[];
  note: string | null;
  meta: string;
  /** Eyebrow above the label on a `current` node. Defaults to "Current step". */
  eyebrow?: string;
  /**
   * Label for an action button rendered inside the node, e.g. "Provide details".
   *
   * Purely descriptive - what the button DOES is decided by whoever renders the
   * plan, since `toPlanNodes` and `applyTaskProgress` stay pure. `PlanNode`
   * shows the button only when a handler is wired up alongside this label.
   */
  action?: string;
}

/**
 * Flattens a workflow into the requester-facing plan.
 *
 * Deliberately LINEAR while the admin flowchart is a graph: a person reading
 * "what happens to my request" wants an ordered list of who touches it, not a
 * DAG. Parallel steps are listed in topological order; the fact that two of
 * them can run at once is not information the requester acts on.
 *
 * PURE FUNCTION - no I/O, no side effects.
 */
export function toPlanNodes(workflow: Workflow): PlanNode[] {
  const nodes: PlanNode[] = [];

  // 1. The submit step.
  nodes.push({
    id: "__submit",
    label: `Submit ${workflow.title}`,
    sub: describeScope(workflow),
    status: "done",
    inputs: [],
    note: null,
    meta: "",
  });

  // 2. Everything the requester must provide, as one node.
  //
  // This node is a PREVIEW here, not a form. On the new-request page there is
  // no task yet - `POST /tasks` has not run - so there is nothing to collect
  // against and the node carries no action. Once the task exists, the status
  // page's plan attaches the button (see `applyTaskProgress`) and the dialog
  // collects the values field by field.
  //
  // The wording has to say "next", never "now" - listing the labels under a
  // "Current step" heading previously read as an instruction to type them into
  // the chat, which posts to the selection endpoint and 409s.
  const requesterInputs = workflow.inputs.filter((i) => i.collected_from.resolution === "requester");
  if (requesterInputs.length > 0) {
    nodes.push({
      id: "__inputs",
      label: "Provide Details",
      sub: "You'll be asked for these after you continue",
      status: "current",
      inputs: requesterInputs.map((i) => i.label),
      note: null,
      meta: "",
      eyebrow: "Coming next",
    });
  }

  // 3. Steps in dependency order.
  for (const step of topologicalOrder(workflow.steps)) {
    nodes.push({
      id: step.id,
      label: step.name,
      sub: describeActor(step),
      status: "todo",
      inputs: [],
      // A conditional step needs its condition explained in plain words,
      // otherwise it looks like an arbitrary extra hoop.
      note: step.condition?.description ?? null,
      meta: "",
    });
  }

  // 4. The outcome.
  nodes.push({
    id: "__complete",
    label: "Collect Authorized Document",
    sub: "Signed authorization, ready to download",
    status: "todo",
    inputs: [],
    note: null,
    meta: "",
  });

  return nodes;
}

/** Names the approver in words a requester recognises. Never a raw snake_case role. */
function describeActor(step: WorkflowStep): string {
  const { assignee } = step;
  if (assignee.display_name) return assignee.display_name;
  if (assignee.resolution === "requester") return "You";
  if (assignee.resolution === "system") return "Automatic";
  if (assignee.role) return titleCase(assignee.role);
  return "To be assigned";
}

function describeScope(workflow: Workflow): string {
  const faculty = workflow.scope.applies_to.constraints.find((c) => c.attribute === "faculty");
  return faculty?.value ? `Faculty of ${faculty.value}` : workflow.scope.institution_type;
}

function titleCase(role: string): string {
  return role.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/**
 * Kahn's algorithm over depends_on.
 *
 * The graph is guaranteed acyclic by the backend's graphValidator, so this
 * always terminates. The `remaining` fallback is defensive only - it keeps the
 * UI rendering rather than looping forever if an unvalidated document ever
 * reaches the client.
 */
function topologicalOrder(steps: WorkflowStep[]): WorkflowStep[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const ordered: WorkflowStep[] = [];

  let remaining = [...steps];
  while (remaining.length > 0) {
    const ready = remaining.filter((s) =>
      s.depends_on.every((d) => visited.has(d.step_id) || !byId.has(d.step_id)),
    );
    if (ready.length === 0) {
      ordered.push(...remaining); // defensive: emit the rest rather than hang
      break;
    }
    for (const step of ready) {
      ordered.push(step);
      visited.add(step.id);
    }
    remaining = remaining.filter((s) => !visited.has(s.id));
  }

  return ordered;
}
