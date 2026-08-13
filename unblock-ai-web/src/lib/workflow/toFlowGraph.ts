import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";
import type { Workflow, WorkflowStep } from "@/types/workflow";

const NODE_WIDTH = 340;
const NODE_HEIGHT = 92;
const TERMINAL_HEIGHT = 40;
const INPUT_HEADER_HEIGHT = 56;
const INPUT_BULLET_ROW_HEIGHT = 27;
const INPUT_BASE_PADDING = 22;

/**
 * Estimates a node's rendered height so dagre's rank spacing matches reality.
 *
 * `input` nodes grow with their bullet count - using the fixed NODE_HEIGHT for
 * them (as a naive port of the step-node layout would) understates their real
 * height and the next rank overlaps them. Terminals and steps are close enough
 * to their fixed heights that estimating further is not worth the complexity.
 */
function estimateNodeHeight(data: FlowNodeData): number {
  if (data.kind === "terminal") return TERMINAL_HEIGHT;
  if (data.kind === "input") {
    return INPUT_HEADER_HEIGHT + INPUT_BASE_PADDING + data.bullets.length * INPUT_BULLET_ROW_HEIGHT;
  }
  return NODE_HEIGHT;
}

export type FlowNodeKind = "terminal" | "input" | "step" | "condition";

export interface FlowNodeData extends Record<string, unknown> {
  kind: FlowNodeKind;
  label: string;
  eyebrow: string;
  detail: string | null;
  bullets: string[];
  isConditional: boolean;
  isBlocked: boolean;
}

/**
 * Converts a workflow document into a laid-out React Flow graph.
 *
 * Structure comes from the DAG, not from array order: `steps[].depends_on` is
 * the ONLY source of edges, which is what makes parallel branches, joins, and
 * conditional gates render correctly for any workflow rather than only the
 * demo one.
 *
 * PURE: no React, no DOM, no I/O. Unit-test it against both gold fixtures.
 */
export function toFlowGraph(workflow: Workflow): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const nodes: Node<FlowNodeData>[] = [];
  const edges: Edge[] = [];

  // 1. Start terminal.
  nodes.push(makeNode("__start", {
    kind: "terminal", label: "Request submitted", eyebrow: "", detail: null,
    bullets: [], isConditional: false, isBlocked: false,
  }));

  // 2. Requester-collected inputs as one grouped node (matches the mockup's
  //    "Input · from requester" card). Skip it entirely when there are none.
  const requesterInputs = workflow.inputs.filter((i) => i.collected_from.resolution === "requester");
  if (requesterInputs.length > 0) {
    nodes.push(makeNode("__inputs", {
      kind: "input",
      label: "Request details",
      eyebrow: "Input · from requester",
      detail: null,
      bullets: requesterInputs.map((i) => i.label),
      isConditional: false,
      isBlocked: false,
    }));
    edges.push(makeEdge("__start", "__inputs"));
  }

  const firstRealNode = requesterInputs.length > 0 ? "__inputs" : "__start";

  // 3. One node per step.
  workflow.steps.forEach((step, index) => {
    nodes.push(makeNode(step.id, {
      kind: step.condition ? "condition" : "step",
      label: step.name,
      eyebrow: `Step ${index + 1} · ${humanizeType(step.type)}`,
      detail: step.description,
      bullets: step.response_fields.map((f) => f.label),
      isConditional: Boolean(step.condition),
      isBlocked: step.initial_state === "blocked",
    }));
  });

  // 4. Edges from depends_on. Entry steps (no dependencies) hang off the inputs.
  for (const step of workflow.steps) {
    if (step.depends_on.length === 0) {
      edges.push(makeEdge(firstRealNode, step.id));
      continue;
    }
    for (const dep of step.depends_on) {
      edges.push(makeEdge(dep.step_id, step.id, dep.required_outcome));
    }
  }

  // 5. End terminal, fed by every step nothing else depends on.
  const hasDependents = new Set(workflow.steps.flatMap((s) => s.depends_on.map((d) => d.step_id)));
  const leaves = workflow.steps.filter((s) => !hasDependents.has(s.id));
  nodes.push(makeNode("__end", {
    kind: "terminal", label: "Completed", eyebrow: "", detail: null,
    bullets: [], isConditional: false, isBlocked: false,
  }));
  for (const leaf of leaves) edges.push(makeEdge(leaf.id, "__end"));

  return layout(nodes, edges);
}

function humanizeType(type: WorkflowStep["type"]): string {
  return {
    approval: "Approval",
    notification: "Notification",
    data_collection: "Input",
    automated_action: "System",
    review: "Review",
  }[type];
}

function makeNode(id: string, data: FlowNodeData): Node<FlowNodeData> {
  return { id, type: data.kind, position: { x: 0, y: 0 }, data };
}

function makeEdge(source: string, target: string, label?: string): Edge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    // Only label non-obvious transitions. Labelling every edge "approved" is noise.
    label: label && label !== "approved" ? label : undefined,
    type: "smoothstep",
    style: { stroke: "rgba(71,85,105,.35)" },
  };
}

/**
 * Assigns coordinates with dagre.
 *
 * Top-to-bottom ranking reproduces the mockup's vertical flow, and dagre places
 * genuinely-parallel steps (same rank, no edge between them) side by side for
 * free - which is exactly the "Parallel/Join" visual, derived rather than
 * hardcoded.
 */
function layout(nodes: Node<FlowNodeData>[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 56, nodesep: 40, marginx: 20, marginy: 20 });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: estimateNodeHeight(node.data) });
  }
  for (const edge of edges) g.setEdge(edge.source, edge.target);

  dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const { x, y } = g.node(node.id);
      const height = estimateNodeHeight(node.data);
      // dagre returns centres; React Flow wants top-left.
      return { ...node, position: { x: x - NODE_WIDTH / 2, y: y - height / 2 } };
    }),
    edges,
  };
}
