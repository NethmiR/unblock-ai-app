import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/lib/workflow/toFlowGraph";

export function StepNode({ data }: NodeProps<Node<FlowNodeData, "step">>) {
  return (
    <div className="w-[340px] rounded-control border border-line-admin bg-surface px-[15px] py-[13px]">
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0" />
      <div className="mb-1 text-[9.5px] font-bold uppercase tracking-[.08em] text-muted">
        {data.eyebrow}
      </div>
      <div className="mb-[3px] text-sm font-semibold text-ink">{data.label}</div>
      {data.detail && <div className="text-xs leading-normal text-muted">{data.detail}</div>}
      {data.isBlocked && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-[11px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-warn" />
          Starts blocked
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0" />
    </div>
  );
}
