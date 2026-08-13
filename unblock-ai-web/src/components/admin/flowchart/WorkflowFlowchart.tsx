"use client";
import { useMemo } from "react";
import { ReactFlow, Background, Controls, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toFlowGraph } from "@/lib/workflow/toFlowGraph";
import { StepNode } from "./nodes/StepNode";
import { InputNode } from "./nodes/InputNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { TerminalNode } from "./nodes/TerminalNode";
import type { Workflow } from "@/types/workflow";

/**
 * Node type registry. Defined at MODULE scope, not inside the component -
 * React Flow re-mounts every node when this object's identity changes, so an
 * inline literal would remount the entire graph on every render.
 */
const NODE_TYPES: NodeTypes = {
  step: StepNode,
  input: InputNode,
  condition: ConditionNode,
  terminal: TerminalNode,
};

export function WorkflowFlowchart({ workflow }: { workflow: Workflow }) {
  const { nodes, edges } = useMemo(() => toFlowGraph(workflow), [workflow]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
      className="bg-[repeating-linear-gradient(135deg,rgba(71,85,105,.025)_0_8px,transparent_8px_16px)]"
    >
      <Background gap={0} color="transparent" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
