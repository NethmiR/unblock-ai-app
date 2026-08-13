import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/lib/workflow/toFlowGraph";

export function TerminalNode({ data }: NodeProps<Node<FlowNodeData, "terminal">>) {
  return (
    <div className="flex items-center gap-2 rounded-pill border border-line-admin bg-surface px-[14px] py-[6px] text-[11px] font-bold uppercase tracking-[.06em] text-muted">
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0" />
      {data.label}
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0" />
    </div>
  );
}
