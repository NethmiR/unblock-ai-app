import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/lib/workflow/toFlowGraph";

export function InputNode({ data }: NodeProps<Node<FlowNodeData, "input">>) {
  return (
    <div className="w-[340px] overflow-hidden rounded-control border border-line-admin bg-surface">
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0" />
      <div className="border-b border-dashed border-line-admin bg-slate-500/[.06] px-3.5 py-[11px]">
        <div className="mb-[3px] text-[9.5px] font-bold uppercase tracking-[.08em] text-muted">
          {data.eyebrow}
        </div>
        <div className="text-sm font-semibold text-ink">{data.label}</div>
      </div>
      <div className="flex flex-col gap-[7px] px-3.5 pb-3 pt-[10px]">
        {data.bullets.map((bullet) => (
          <div key={bullet} className="flex items-center gap-2 text-[12.5px] text-muted">
            <span className="h-[5px] w-[5px] rounded-[1px] bg-muted" />
            {bullet}
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0" />
    </div>
  );
}
