import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/lib/workflow/toFlowGraph";

export function ConditionNode({ data }: NodeProps<Node<FlowNodeData, "condition">>) {
  return (
    <div className="w-[340px] rounded-control border border-dashed border-line-admin bg-surface px-[15px] py-3 text-center">
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0" />
      <div className="mb-1 text-[9.5px] font-bold uppercase tracking-[.08em] text-muted">
        {data.eyebrow}
      </div>
      <div className="text-sm font-semibold text-ink">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0" />
    </div>
  );
}
